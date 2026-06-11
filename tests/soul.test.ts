// tests/soul.test.ts
import { describe, it, expect } from "vitest";
import { loadSoul } from "../src/core/soul.js";

describe("loadSoul", () => {
  it("incluye identidad y los cinco protocolos", () => {
    const soul = loadSoul();
    expect(soul).toContain("Eres Ares");
    for (const marca of [
      "Protocolo: debugging",
      "buscar antes de crear",
      "verificación antes de afirmar",
      "trabajo por pasos",
      "aprender de las correcciones",
    ]) {
      expect(soul).toContain(marca);
    }
  });
});
