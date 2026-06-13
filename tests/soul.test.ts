// tests/soul.test.ts
import { describe, it, expect } from "vitest";
import { loadSoul } from "../src/core/soul.js";

describe("loadSoul", () => {
  it("incluye identidad, los doce protocolos y el bloque de carácter", () => {
    const soul = loadSoul();
    expect(soul).toContain("Eres Ares");
    expect(soul).toContain("## Carácter");
    for (const marca of [
      "Protocolo: debugging",
      "buscar antes de crear",
      "verificación antes de afirmar",
      "trabajo por pasos",
      "aprender de las correcciones",
      "discrepar bien",
      "flujo disciplinado",
      "investigar antes de especificar",
      "tests primero",
      "ojos estructurales",
      "notas del proyecto",
      "criterio de ingeniería",
    ]) {
      expect(soul).toContain(marca);
    }
  });
});
