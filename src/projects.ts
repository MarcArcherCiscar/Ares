import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { expandPath } from "./config.js";

export interface Project {
  name: string;
  /** Absolute working directory the agent operates in for this project. */
  cwd: string;
  /** Optional system-prompt instructions appended for this project. */
  instructions?: string;
  /** Where this project came from (for display). */
  source: "configured" | "discovered" | "path";
}

interface ProjectsFile {
  default?: string;
  projects: Record<string, { cwd: string; instructions?: string }>;
}

/** Files that mark a directory as a "project" worth discovering. */
const PROJECT_MARKERS = [
  ".git",
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "Gemfile",
  "composer.json",
  ".ares.md",
];

/** Files read (in order) to seed a discovered project's instructions. */
const INSTRUCTION_FILES = [".ares.md", "CLAUDE.md", "AGENTS.md"];

const DISCOVERY_TTL_MS = 15_000;

/**
 * Resolves projects from three sources, in priority order:
 *  1. Explicitly configured projects (ares.projects.json)
 *  2. Auto-discovered projects under the configured roots (your dev folders)
 *  3. An ad-hoc directory path the user types directly
 */
export class Projects {
  private readonly configured = new Map<string, Project>();
  private readonly defaultName: string;
  private discovered: Project[] = [];
  private discoveredAt = 0;

  constructor(
    projectsFile: string,
    private readonly fallbackCwd: string,
    private readonly roots: string[] = [],
  ) {
    if (existsSync(projectsFile)) {
      const parsed = JSON.parse(readFileSync(projectsFile, "utf8")) as ProjectsFile;
      const baseDir = resolve(projectsFile, "..");
      for (const [name, cfg] of Object.entries(parsed.projects ?? {})) {
        const cwd = isAbsolute(cfg.cwd) ? cfg.cwd : resolve(baseDir, expandPathLike(cfg.cwd));
        this.configured.set(name, { name, cwd, instructions: cfg.instructions, source: "configured" });
      }
      this.defaultName =
        parsed.default && this.configured.has(parsed.default)
          ? parsed.default
          : (this.configured.keys().next().value ?? "default");
    } else {
      this.defaultName = "default";
    }

    if (this.configured.size === 0) {
      this.configured.set("default", { name: "default", cwd: fallbackCwd, source: "configured" });
    }
  }

  configuredProjects(): Project[] {
    return [...this.configured.values()];
  }

  /** Auto-discovered projects under the roots (cached briefly). */
  discoveredProjects(forceRefresh = false): Project[] {
    if (!forceRefresh && Date.now() - this.discoveredAt < DISCOVERY_TTL_MS) {
      return this.discovered;
    }
    const found: Project[] = [];
    for (const root of this.roots) {
      let entries: string[] = [];
      try {
        entries = readdirSync(root);
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.startsWith(".") || entry === "node_modules") continue;
        const dir = join(root, entry);
        if (!isDir(dir) || !looksLikeProject(dir)) continue;
        found.push({ name: entry, cwd: dir, instructions: readInstructions(dir), source: "discovered" });
      }
    }
    this.discovered = found.sort((a, b) => a.name.localeCompare(b.name));
    this.discoveredAt = Date.now();
    return this.discovered;
  }

  get defaultProjectName(): string {
    return this.defaultName;
  }

  /** The project used when a chat hasn't selected one. */
  default(): Project {
    return this.configured.get(this.defaultName) ?? this.configuredProjects()[0];
  }

  /**
   * Resolve a chat's stored selection. If a concrete cwd was stored (an ad-hoc
   * or discovered project), trust it; otherwise fall back to the default.
   */
  fromRecord(name: string | undefined, cwd: string | undefined, instructions?: string): Project {
    if (cwd && isDir(cwd)) {
      return { name: name ?? basename(cwd), cwd, instructions, source: "path" };
    }
    if (name && this.configured.has(name)) return this.configured.get(name)!;
    return this.default();
  }

  /**
   * Find candidate projects for a user query. Tries, in order: a literal
   * directory path, an exact name match, then a substring match across
   * configured + discovered projects. Returns all candidates so the caller can
   * disambiguate when there's more than one.
   */
  resolve(query: string): Project[] {
    const q = query.trim();
    if (!q) return [];

    // 1. Direct path (absolute, ~, ./, or relative to a root / fallback cwd).
    const asPath = this.tryPath(q);
    if (asPath) return [asPath];

    // 2 & 3. Name match across configured + discovered.
    const all = [...this.configuredProjects(), ...this.discoveredProjects()];
    const lower = q.toLowerCase();

    const exact = all.filter((p) => p.name.toLowerCase() === lower);
    if (exact.length > 0) return dedupe(exact);

    return dedupe(all.filter((p) => p.name.toLowerCase().includes(lower)));
  }

  private tryPath(q: string): Project | null {
    const candidates = [
      isAbsolute(q) || q.startsWith("~") ? expandPath(q) : null,
      resolve(this.fallbackCwd, q),
      ...this.roots.map((r) => resolve(r, q)),
    ].filter((p): p is string => p !== null);

    for (const cwd of candidates) {
      if (isDir(cwd)) {
        return { name: basename(cwd), cwd, instructions: readInstructions(cwd), source: "path" };
      }
    }
    return null;
  }
}

function dedupe(projects: Project[]): Project[] {
  const seen = new Set<string>();
  return projects.filter((p) => (seen.has(p.cwd) ? false : (seen.add(p.cwd), true)));
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function looksLikeProject(dir: string): boolean {
  return PROJECT_MARKERS.some((m) => existsSync(join(dir, m)));
}

function readInstructions(dir: string): string | undefined {
  for (const file of INSTRUCTION_FILES) {
    const path = join(dir, file);
    if (existsSync(path)) {
      try {
        return readFileSync(path, "utf8").slice(0, 4000);
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/** Expand ~ in a configured cwd without forcing absolute resolution. */
function expandPathLike(p: string): string {
  return p.startsWith("~") ? expandPath(p) : p;
}
