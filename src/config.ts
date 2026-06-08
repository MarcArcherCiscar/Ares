import "dotenv/config";
import { resolve } from "node:path";

/** Parse a comma-separated env var into a list of trimmed, non-empty strings. */
function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
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
  anthropicApiKey: string;
  model: string;
  workspaceDir: string;
  maxTurns: number;
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
    anthropicApiKey: required("ANTHROPIC_API_KEY"),
    model: process.env.ARES_MODEL?.trim() || "claude-opus-4-8",
    workspaceDir: resolve(process.env.ARES_WORKSPACE_DIR?.trim() || process.cwd()),
    maxTurns: Number(process.env.ARES_MAX_TURNS) || 40,
  };
}
