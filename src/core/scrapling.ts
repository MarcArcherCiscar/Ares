// src/core/scrapling.ts
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** Ejecuta un comando; null si el binario no existe o el spawn falla. */
export type Runner = (cmd: string, args: string[]) => { code: number } | null;

const defaultRunner: Runner = (cmd, args) => {
  try {
    const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 15_000 });
    if (r.error) return null;
    return { code: r.status ?? 1 };
  } catch {
    return null;
  }
};

/**
 * Ruta al SKILL.md de Scrapling vendorizado dentro de Ares. Se resuelve relativo
 * a este módulo (src/core/scrapling.ts en dev, dist/core/scrapling.js en build),
 * así viaja con la instalación — sin depender de ningún repo local.
 */
export function scraplingSkillPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "skills", "scrapling", "SKILL.md");
}

/** true si la skill vendorizada está presente (debería estarlo siempre tras build). */
export function scraplingSkillAvailable(): boolean {
  return existsSync(scraplingSkillPath());
}

/** true si la librería `scrapling` está importable en el python3 del entorno. */
export function scraplingInstalled(run: Runner = defaultRunner): boolean {
  const r = run("python3", ["-c", "import scrapling"]);
  return r !== null && r.code === 0;
}
