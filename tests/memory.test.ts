// tests/memory.test.ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Memory } from "../src/core/memory.js";

function freshMemory(): Memory {
  return new Memory(mkdtempSync(join(tmpdir(), "ares-mem-")));
}

describe("Memory", () => {
  it("index() devuelve cadena vacía sin memoria previa", () => {
    expect(freshMemory().index()).toBe("");
  });

  it("save() crea el archivo con frontmatter y lo añade al índice", () => {
    const mem = freshMemory();
    const file = mem.save({
      name: "Prefiere Vitest",
      description: "Marc prefiere vitest a jest",
      type: "user",
      body: "Marc usa vitest en todos sus proyectos TS.",
    });
    expect(existsSync(file)).toBe(true);
    const content = readFileSync(file, "utf8");
    expect(content).toContain("name: prefiere-vitest"); // slug normalizado
    expect(content).toContain("type: user");
    expect(mem.index()).toContain("[prefiere-vitest](prefiere-vitest.md) — Marc prefiere vitest a jest");
  });

  it("re-guardar el mismo name actualiza el archivo sin duplicar la línea del índice", () => {
    const mem = freshMemory();
    mem.save({ name: "dato", description: "v1", type: "project", body: "a" });
    mem.save({ name: "dato", description: "v2", type: "project", body: "b" });
    const lines = mem.index().split("\n").filter((l) => l.includes("(dato.md)"));
    expect(lines).toHaveLength(1);
  });
});
