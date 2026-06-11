// src/core/config.ts
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";

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

/** Lee ~/.ares/config.json mergeado sobre los defaults. Nunca lanza. */
export function loadUserConfig(dir: string = ARES_HOME): AresUserConfig {
  const file = join(dir, "config.json");
  if (!existsSync(file)) return { ...DEFAULT_CONFIG };
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<AresUserConfig>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (err) {
    console.warn(`Ares: no pude leer ${file} (${(err as Error).message}); uso defaults.`);
    return { ...DEFAULT_CONFIG };
  }
}
