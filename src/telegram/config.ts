import "dotenv/config";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

/** Parse a comma-separated env var into a list of trimmed, non-empty strings. */
function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Expand a leading ~ to the user's home directory, then resolve to absolute. */
export function expandPath(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return resolve(homedir(), p.slice(2));
  return resolve(p);
}

/**
 * Roots to auto-discover projects under. If ARES_PROJECTS_ROOTS is set, use it;
 * otherwise default to the user's home directory so discovery is zero-config
 * (Ares searches recursively and finds your repos wherever they live).
 */
function resolveProjectRoots(): string[] {
  const explicit = parseList(process.env.ARES_PROJECTS_ROOTS).map(expandPath);
  if (explicit.length > 0) return [...new Set(explicit.filter((d) => existsSync(d)))];
  return [homedir()];
}

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value.trim();
}

export interface AresConfig {
  telegramBotToken: string;
  /** Numeric Telegram user IDs allowed to use the bot. Empty = allow everyone (dev only). */
  allowedUserIds: Set<number>;
  /** Auth la gestiona el binario `claude` (sesión de suscripción o CLAUDE_CODE_OAUTH_TOKEN). La API key solo es un fallback opcional. */
  anthropicApiKey: string;
  /** Fallback working directory when no project file/selection applies. */
  workspaceDir: string;
  maxTurns: number;
  /** Directory for persisted state and per-run screenshot output. */
  dataDir: string;
  /** Path to the projects definition file. */
  projectsFile: string;
  /** Directories scanned to auto-discover local projects. */
  projectRoots: string[];
  /** Maximum recursion depth when discovering projects under the roots. */
  projectDepth: number;
}

export function loadConfig(): AresConfig {
  const allowedUserIds = new Set(
    parseList(process.env.TELEGRAM_ALLOWED_USER_IDS).map((id) => Number(id)),
  );

  if (allowedUserIds.size === 0) {
    console.warn(
      "⚠️  TELEGRAM_ALLOWED_USER_IDS is empty — the bot will respond to ANYONE. " +
        "Set it before exposing the bot; this agent can run code on your machine.",
    );
  }

  return {
    telegramBotToken: required("TELEGRAM_BOT_TOKEN"),
    allowedUserIds,
    // La auth la gestiona el binario `claude` (sesión de suscripción o
    // CLAUDE_CODE_OAUTH_TOKEN). La API key solo es un fallback opcional.
    anthropicApiKey: process.env.ANTHROPIC_API_KEY?.trim() || "",
    workspaceDir: resolve(process.env.ARES_WORKSPACE_DIR?.trim() || process.cwd()),
    maxTurns: Number(process.env.ARES_MAX_TURNS) || 40,
    dataDir: resolve(process.env.ARES_DATA_DIR?.trim() || "data"),
    projectsFile: resolve(process.env.ARES_PROJECTS_FILE?.trim() || "ares.projects.json"),
    projectRoots: resolveProjectRoots(),
    projectDepth: Number(process.env.ARES_PROJECTS_DEPTH) || 6,
  };
}
