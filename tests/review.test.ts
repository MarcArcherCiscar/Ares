// tests/review.test.ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findReviewSkill } from "../src/core/review.js";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "ares-review-"));
}

describe("findReviewSkill", () => {
  it("el repo gana: .claude/skills/*review*/SKILL.md tiene precedencia", () => {
    const dir = tmp();
    writeFileSync(join(dir, "Cargo.toml"), "[package]"); // también es Rust, pero el repo manda
    const skillDir = join(dir, ".claude", "skills", "code-review-discipline");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "# review local");
    const r = findReviewSkill(dir, tmp()); // segundo arg: home de skills (vacío)
    expect(r.source).toBe("repo");
    expect(r.path).toBe(join(skillDir, "SKILL.md"));
    expect(r.content).toContain("review local");
  });

  it("fallback a tecnología: Cargo.toml sin skill local → review-rust de la librería", () => {
    const repo = tmp();
    writeFileSync(join(repo, "Cargo.toml"), "[package]");
    const home = tmp();
    const techDir = join(home, "review-rust");
    mkdirSync(techDir, { recursive: true });
    writeFileSync(join(techDir, "SKILL.md"), "# review rust central");
    const r = findReviewSkill(repo, home);
    expect(r.source).toBe("tech");
    expect(r.tech).toBe("rust");
    expect(r.content).toContain("review rust central");
  });

  it("detecta typescript por package.json", () => {
    const repo = tmp();
    writeFileSync(join(repo, "package.json"), "{}");
    const home = tmp();
    const techDir = join(home, "review-typescript");
    mkdirSync(techDir, { recursive: true });
    writeFileSync(join(techDir, "SKILL.md"), "# ts");
    const r = findReviewSkill(repo, home);
    expect(r.source).toBe("tech");
    expect(r.tech).toBe("typescript");
  });

  it("genérico cuando no hay skill local ni de tecnología", () => {
    const r = findReviewSkill(tmp(), tmp());
    expect(r.source).toBe("generic");
    expect(r.content.length).toBeGreaterThan(0); // trae el review genérico incorporado
  });

  it("tech detectada pero sin SKILL.md en la librería → genérico (con tech informada)", () => {
    const repo = tmp();
    writeFileSync(join(repo, "go.mod"), "module x");
    const r = findReviewSkill(repo, tmp());
    expect(r.source).toBe("generic");
    expect(r.tech).toBe("go");
  });
});
