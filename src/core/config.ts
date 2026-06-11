// src/core/config.ts
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";

/** Directorio raíz de estado de Ares (config, memoria). */
export const ARES_HOME = join(homedir(), ".ares");

export interface AresUserConfig {
  /** Cadena de preferencia: el primero es el modelo principal, el resto fallbacks en orden. */
  models: string[];
  maxTurns: number;
  thinking: "adaptive" | "disabled";
}

export const DEFAULT_CONFIG: AresUserConfig = {
  models: ["claude-fable-5", "claude-opus-4-8"],
  maxTurns: 40,
  thinking: "adaptive",
};

/** Zod schema — each field independently falls back to its default on invalid input. */
const UserConfigSchema = z.object({
  models: z
    .array(z.string().min(1))
    .min(1)
    .catch(DEFAULT_CONFIG.models),
  maxTurns: z
    .number()
    .int()
    .positive()
    .catch(DEFAULT_CONFIG.maxTurns),
  thinking: z
    .enum(["adaptive", "disabled"])
    .catch(DEFAULT_CONFIG.thinking),
});

/** Lee ~/.ares/config.json mergeado sobre los defaults. Nunca lanza. */
export function loadUserConfig(dir: string = ARES_HOME): AresUserConfig {
  const file = join(dir, "config.json");
  if (!existsSync(file)) return { ...DEFAULT_CONFIG };
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    // Parse with defaults-on-error; spread DEFAULT_CONFIG first so missing keys
    // get defaults, then overlay the validated (and individually-fallback'd) values.
    return UserConfigSchema.parse({ ...DEFAULT_CONFIG, ...raw });
  } catch (err) {
    console.warn(`Ares: no pude leer ${file} (${(err as Error).message}); uso defaults.`);
    return { ...DEFAULT_CONFIG };
  }
}
