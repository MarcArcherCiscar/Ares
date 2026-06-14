// tests/telegram-store.test.ts
import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/telegram/store.js";

const store = () => new Store(mkdtempSync(join(tmpdir(), "ares-tg-store-")));

describe("Store — historial de conversaciones por proyecto", () => {
  it("vacío al principio", () => {
    expect(store().listConversations(1, "/repo")).toEqual([]);
  });

  it("registra una conversación con su título", () => {
    const s = store();
    s.recordConversation(1, "/repo", "sid1", "arregla el login");
    const list = s.listConversations(1, "/repo");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ sessionId: "sid1", firstPrompt: "arregla el login" });
  });

  it("re-registrar el mismo sessionId actualiza sin duplicar", () => {
    const s = store();
    s.recordConversation(1, "/repo", "sid1", "primero");
    s.recordConversation(1, "/repo", "sid1", "segundo");
    const list = s.listConversations(1, "/repo");
    expect(list).toHaveLength(1);
    expect(list[0].firstPrompt).toBe("primero");
    expect(list[0].lastPrompt).toBe("segundo");
  });

  it("varias conversaciones por proyecto y aislamiento entre proyectos/chats", () => {
    const s = store();
    s.recordConversation(1, "/repo", "a", "hilo A");
    s.recordConversation(1, "/repo", "b", "hilo B");
    s.recordConversation(1, "/otro", "c", "otro proyecto");
    s.recordConversation(2, "/repo", "d", "otro chat");
    expect(s.listConversations(1, "/repo").map((c) => c.sessionId).sort()).toEqual(["a", "b"]);
    expect(s.listConversations(1, "/otro").map((c) => c.sessionId)).toEqual(["c"]);
    expect(s.listConversations(2, "/repo").map((c) => c.sessionId)).toEqual(["d"]);
  });

  it("persiste entre instancias (mismo dataDir)", () => {
    const dir = mkdtempSync(join(tmpdir(), "ares-tg-store-"));
    new Store(dir).recordConversation(1, "/repo", "sid1", "algo");
    expect(new Store(dir).listConversations(1, "/repo")).toHaveLength(1);
  });
});
