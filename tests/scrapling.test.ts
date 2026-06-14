// tests/scrapling.test.ts
import { describe, it, expect } from "vitest";
import { scraplingInstalled, scraplingSkillAvailable, scraplingSkillPath, type Runner } from "../src/core/scrapling.js";

const runnerOf = (result: { code: number } | null): Runner => () => result;

describe("scrapling", () => {
  it("scraplingInstalled true cuando python importa scrapling (code 0)", () => {
    expect(scraplingInstalled(runnerOf({ code: 0 }))).toBe(true);
  });

  it("scraplingInstalled false cuando el import falla (code != 0)", () => {
    expect(scraplingInstalled(runnerOf({ code: 1 }))).toBe(false);
  });

  it("scraplingInstalled false cuando no hay python3 (runner null)", () => {
    expect(scraplingInstalled(runnerOf(null))).toBe(false);
  });

  it("la skill vendorizada existe en el repo", () => {
    expect(scraplingSkillAvailable()).toBe(true);
    expect(scraplingSkillPath()).toMatch(/skills\/scrapling\/SKILL\.md$/);
  });
});
