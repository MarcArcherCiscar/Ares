// tests/soul.test.ts
import { describe, it, expect } from "vitest";
import { loadSoul } from "../src/core/soul.js";

describe("loadSoul", () => {
  it("incluye identidad y los tres protocolos en orden", () => {
    const soul = loadSoul();
    expect(soul).toContain("Eres Ares");
    const iDebug = soul.indexOf("Protocolo: debugging");
    const iSearch = soul.indexOf("buscar antes de crear");
    const iVerify = soul.indexOf("verificación antes de afirmar");
    expect(iDebug).toBeGreaterThan(-1);
    expect(iSearch).toBeGreaterThan(-1);
    expect(iVerify).toBeGreaterThan(-1);
  });
});
