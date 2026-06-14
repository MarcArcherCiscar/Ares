// tests/cli-sessions.test.ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordTurn, listSessions, latestSession } from "../src/cli/sessions.js";

const tmp = () => mkdtempSync(join(tmpdir(), "ares-cli-sess-"));

describe("cli sessions (historial por carpeta)", () => {
  it("listSessions vacío y latestSession null cuando no hay nada", () => {
    const dir = tmp();
    expect(listSessions("/repo", dir)).toEqual([]);
    expect(latestSession("/repo", dir)).toBeNull();
  });

  it("registra una conversación nueva con su título (firstPrompt)", () => {
    const dir = tmp();
    recordTurn("/repo", "s1", "arregla el login", dir);
    const list = listSessions("/repo", dir);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ sessionId: "s1", firstPrompt: "arregla el login", lastPrompt: "arregla el login" });
  });

  it("re-registrar el mismo sessionId actualiza lastPrompt sin duplicar", () => {
    const dir = tmp();
    recordTurn("/repo", "s1", "primer encargo", dir);
    recordTurn("/repo", "s1", "segundo encargo", dir);
    const list = listSessions("/repo", dir);
    expect(list).toHaveLength(1);
    expect(list[0].firstPrompt).toBe("primer encargo");
    expect(list[0].lastPrompt).toBe("segundo encargo");
  });

  it("varias conversaciones en la misma carpeta conviven", () => {
    const dir = tmp();
    recordTurn("/repo", "s1", "hilo A", dir);
    recordTurn("/repo", "s2", "hilo B", dir);
    const ids = listSessions("/repo", dir).map((s) => s.sessionId);
    expect(ids).toHaveLength(2);
    expect(ids).toContain("s1");
    expect(ids).toContain("s2");
    expect(latestSession("/repo", dir)).not.toBeNull();
  });

  it("migra el formato viejo (un objeto por carpeta) a lista sin petar", () => {
    const dir = tmp();
    // Simula un cli-sessions.json del formato antiguo.
    writeFileSync(
      join(dir, "cli-sessions.json"),
      JSON.stringify({ "/repo": { sessionId: "old", lastPrompt: "lo de antes", updatedAt: "2026-06-14T00:00:00.000Z" } }),
    );
    const list = listSessions("/repo", dir);
    expect(list).toHaveLength(1);
    expect(list[0].sessionId).toBe("old");
    expect(latestSession("/repo", dir)?.sessionId).toBe("old");
  });

  it("las carpetas son independientes", () => {
    const dir = tmp();
    recordTurn("/repo/a", "sa", "pa", dir);
    recordTurn("/repo/b", "sb", "pb", dir);
    expect(listSessions("/repo/a", dir).map((s) => s.sessionId)).toEqual(["sa"]);
    expect(listSessions("/repo/b", dir).map((s) => s.sessionId)).toEqual(["sb"]);
  });
});
