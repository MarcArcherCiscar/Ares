import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

export interface Project {
  name: string;
  /** Absolute working directory the agent operates in for this project. */
  cwd: string;
  /** Optional system-prompt instructions appended for this project. */
  instructions?: string;
}

interface ProjectsFile {
  default?: string;
  projects: Record<string, { cwd: string; instructions?: string }>;
}

/**
 * Loads named projects from a JSON file (see ares.projects.example.json).
 * If the file is missing, exposes a single "default" project rooted at the
 * agent's workspace directory.
 */
export class Projects {
  private readonly projects = new Map<string, Project>();
  private readonly defaultName: string;

  constructor(projectsFile: string, fallbackCwd: string) {
    if (existsSync(projectsFile)) {
      const parsed = JSON.parse(readFileSync(projectsFile, "utf8")) as ProjectsFile;
      const baseDir = resolve(projectsFile, "..");
      for (const [name, cfg] of Object.entries(parsed.projects ?? {})) {
        this.projects.set(name, {
          name,
          cwd: isAbsolute(cfg.cwd) ? cfg.cwd : resolve(baseDir, cfg.cwd),
          instructions: cfg.instructions,
        });
      }
      this.defaultName =
        parsed.default && this.projects.has(parsed.default)
          ? parsed.default
          : (this.projects.keys().next().value ?? "default");
    } else {
      this.defaultName = "default";
    }

    if (this.projects.size === 0) {
      this.projects.set("default", { name: "default", cwd: fallbackCwd });
    }
  }

  list(): Project[] {
    return [...this.projects.values()];
  }

  has(name: string): boolean {
    return this.projects.has(name);
  }

  get(name: string | undefined): Project {
    if (name && this.projects.has(name)) return this.projects.get(name)!;
    return this.projects.get(this.defaultName) ?? this.list()[0];
  }

  get defaultProjectName(): string {
    return this.defaultName;
  }
}
