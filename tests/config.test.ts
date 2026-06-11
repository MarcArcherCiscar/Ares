// tests/config.test.ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadUserConfig, DEFAULT_CONFIG } from "../src/core/config.js";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "ares-config-"));
}

describe("loadUserConfig", () => {
  it("devuelve defaults cuando no hay config.json", () => {
    const cfg = loadUserConfig(tmp());
    expect(cfg.models).toEqual(["claude-fable-5", "claude-opus-4-8"]);
    expect(cfg.maxTurns).toBe(DEFAULT_CONFIG.maxTurns);
    expect(cfg.thinking).toBe("adaptive");
  });

  it("mergea el archivo sobre los defaults", () => {
    const dir = tmp();
    writeFileSync(join(dir, "config.json"), JSON.stringify({ models: ["claude-haiku-4-5"] }));
    const cfg = loadUserConfig(dir);
    expect(cfg.models).toEqual(["claude-haiku-4-5"]);
    expect(cfg.maxTurns).toBe(DEFAULT_CONFIG.maxTurns); // el resto sigue en default
  });

  it("tolera JSON roto y devuelve defaults", () => {
    const dir = tmp();
    writeFileSync(join(dir, "config.json"), "{no es json");
    expect(loadUserConfig(dir)).toEqual(DEFAULT_CONFIG);
  });
});
