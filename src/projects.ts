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

/** Directory names never descended into during discovery (noise / huge). */
const SKIP_DIRS = new Set([
  "node_modules", "vendor", "dist", "build", "out", "target", ".git", ".hg", ".svn",
  "Library", "Applications", "AppData", "Pictures", "Music", "Movies", "Videos",
  ".cache", ".npm", ".yarn", ".pnpm", ".cargo", ".rustup", ".gradle", ".m2",
  ".nvm", ".local", ".config", "Trash", ".Trash", "snap", "go",
]);

const DISCOVERY_TTL_MS = 60_000;
/** Hard cap on directories visited per scan, to bound worst-case home scans. */
const SCAN_BUDGET = 40_000;

/**
 * Resolves projects from three sources, in priority order:
 *  1. Explicitly configured projects (ares.projects.json)
 *  2. Auto-discovered projects under the roots (your dev folders / home)
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
    private readonly maxDepth = 6,
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
    const byCwd = new Map<string, Project>();
    const budget = { left: SCAN_BUDGET };
    for (const root of this.roots) {
      for (const p of scanRoot(root, this.maxDepth, budget)) {
        byCwd.set(p.cwd, p);
      }
    }
    this.discovered = [...byCwd.values()].sort((a, b) => a.name.localeCompare(b.name));
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
   * Find candidate projects for a user query. Order:
   *  1. a literal directory path,
   *  2. exact (separator-insensitive) name match,
   *  3. name substring match,
   *  4. token match against name + path ("dafne api proyectos").
   * Returns all candidates so the caller can disambiguate.
   */
  resolve(query: string): Project[] {
    const q = query.trim();
    if (!q) return [];

    const asPath = this.tryPath(q);
    if (asPath) return [asPath];

    const all = dedupe([...this.configuredProjects(), ...this.discoveredProjects()]);
    const nq = normalize(q);

    const exact = all.filter((p) => normalize(p.name) === nq);
    if (exact.length > 0) return exact;

    const substr = all.filter((p) => normalize(p.name).includes(nq));
    if (substr.length > 0) return substr;

    const tokens = q.toLowerCase().split(/[\s._/-]+/).filter(Boolean);
    return all.filter((p) => {
      const hay = `${p.name} ${p.cwd}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
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

/** Recursively scan a root for project directories, bounded by depth + budget. */
function scanRoot(root: string, maxDepth: number, budget: { left: number }): Project[] {
  const out: Project[] = [];

  const walk = (dir: string, depth: number): void => {
    if (depth > maxDepth || budget.left <= 0) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (budget.left-- <= 0) return;
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      if (name.startsWith(".") || SKIP_DIRS.has(name)) continue;
      const full = join(dir, name);
      if (looksLikeProject(full)) {
        // It's a project — record it and don't descend into its internals.
        out.push({ name, cwd: full, instructions: readInstructions(full), source: "discovered" });
        continue;
      }
      walk(full, depth + 1);
    }
  };

  walk(root, 0);
  return out;
}

/** Lowercase and strip separators so "dafne api" == "dafne-api" == "dafneapi". */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s._-]+/g, "");
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
