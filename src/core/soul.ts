// src/core/soul.ts
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * El alma vive en archivos junto a este módulo (src/core/soul/ en dev,
 * dist/core/soul/ tras `npm run build` — el build los copia).
 */
const SOUL_DIR = join(dirname(fileURLToPath(import.meta.url)), "soul");

/** soul.md + todos los protocolos, concatenados para el append del system prompt. */
export function loadSoul(dir: string = SOUL_DIR): string {
  const soul = readFileSync(join(dir, "soul.md"), "utf8");
  const protoDir = join(dir, "protocols");
  const protocols = existsSync(protoDir)
    ? readdirSync(protoDir)
        .filter((f) => f.endsWith(".md"))
        .sort()
        .map((f) => readFileSync(join(protoDir, f), "utf8"))
    : [];
  return [soul, ...protocols].join("\n\n---\n\n");
}
