// src/core/memory.ts
import { mkdirSync, readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { ARES_HOME } from "./config.js";

export type MemoryType = "user" | "feedback" | "project" | "reference";

export interface MemoryEntry {
  /** Nombre legible; se normaliza a slug kebab-case para el archivo. */
  name: string;
  /** Resumen de una línea (va al índice). */
  description: string;
  type: MemoryType;
  /** El hecho completo, en markdown. */
  body: string;
}

/**
 * Memoria persistente de Marc: un archivo .md por hecho + MEMORY.md como
 * índice de una línea por recuerdo. El índice se inyecta en el system prompt
 * de cada sesión (cualquier canal).
 */
export class Memory {
  readonly dir: string;

  constructor(baseDir: string = join(ARES_HOME, "memory")) {
    this.dir = baseDir;
    mkdirSync(this.dir, { recursive: true });
  }

  private get indexFile(): string {
    return join(this.dir, "MEMORY.md");
  }

  /** Contenido de MEMORY.md, o "" si aún no existe. */
  index(): string {
    return existsSync(this.indexFile) ? readFileSync(this.indexFile, "utf8") : "";
  }

  /** Crea o actualiza un recuerdo. Devuelve la ruta del archivo escrito. */
  save(entry: MemoryEntry): string {
    const slug = entry.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const file = join(this.dir, `${slug}.md`);
    const isNew = !existsSync(file);
    writeFileSync(
      file,
      ["---", `name: ${slug}`, `description: ${entry.description}`, `type: ${entry.type}`, "---", "", entry.body, ""].join("\n"),
    );
    if (isNew) {
      appendFileSync(this.indexFile, `- [${slug}](${slug}.md) — ${entry.description}\n`);
    }
    return file;
  }
}
