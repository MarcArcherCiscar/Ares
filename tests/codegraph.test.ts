// tests/codegraph.test.ts
import { describe, it, expect } from "vitest";
import { codegraphState, type CodegraphRunner } from "../src/core/codegraph.js";

// runner falso: devuelve lo que le digamos, o null si simula binario ausente.
function runnerOf(result: { code: number; stdout: string } | null): CodegraphRunner {
  return () => result;
}

describe("codegraphState", () => {
  it("ready cuando status --json devuelve initialized:true", () => {
    const run = runnerOf({ code: 0, stdout: JSON.stringify({ initialized: true, fileCount: 10 }) });
    expect(codegraphState("/repo", run)).toBe("ready");
  });

  it("needs-init cuando status --json devuelve initialized:false", () => {
    const run = runnerOf({ code: 0, stdout: JSON.stringify({ initialized: false }) });
    expect(codegraphState("/repo", run)).toBe("needs-init");
  });

  it("absent cuando el binario no está (runner devuelve null)", () => {
    expect(codegraphState("/repo", runnerOf(null))).toBe("absent");
  });

  it("absent cuando la salida no es JSON parseable", () => {
    const run = runnerOf({ code: 0, stdout: "no soy json" });
    expect(codegraphState("/repo", run)).toBe("absent");
  });
});
