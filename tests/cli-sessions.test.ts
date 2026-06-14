// tests/cli-sessions.test.ts
import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSession, saveSession, clearSession } from "../src/cli/sessions.js";

const tmp = () => mkdtempSync(join(tmpdir(), "ares-cli-sess-"));

describe("cli sessions", () => {
  it("loadSession devuelve null cuando no hay nada guardado", () => {
    expect(loadSession("/repo", tmp())).toBeNull();
  });

  it("guarda y retoma por cwd (independientes entre carpetas)", () => {
    const dir = tmp();
    saveSession("/repo/a", "sess-1", "haz X", dir);
    saveSession("/repo/b", "sess-2", "haz Y", dir);
    expect(loadSession("/repo/a", dir)?.sessionId).toBe("sess-1");
    expect(loadSession("/repo/a", dir)?.lastPrompt).toBe("haz X");
    expect(loadSession("/repo/b", dir)?.sessionId).toBe("sess-2");
  });

  it("re-guardar la misma cwd sobreescribe", () => {
    const dir = tmp();
    saveSession("/repo", "old", "p1", dir);
    saveSession("/repo", "new", "p2", dir);
    expect(loadSession("/repo", dir)?.sessionId).toBe("new");
  });

  it("clearSession olvida solo esa carpeta", () => {
    const dir = tmp();
    saveSession("/repo/a", "sa", "pa", dir);
    saveSession("/repo/b", "sb", "pb", dir);
    clearSession("/repo/a", dir);
    expect(loadSession("/repo/a", dir)).toBeNull();
    expect(loadSession("/repo/b", dir)?.sessionId).toBe("sb");
  });
});
