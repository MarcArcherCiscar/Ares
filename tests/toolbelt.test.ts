// tests/toolbelt.test.ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rememberTool } from "../src/core/toolbelt/remember.js";
import { buildToolbelt } from "../src/core/toolbelt/index.js";

describe("toolbelt", () => {
  it("buildToolbelt construye un servidor MCP sin lanzar", () => {
    const ctx = { outputDir: mkdtempSync(join(tmpdir(), "ares-out-")) };
    expect(() => buildToolbelt(ctx)).not.toThrow();
  });

  it("remember guarda el recuerdo en el memoryDir del contexto", async () => {
    const memoryDir = mkdtempSync(join(tmpdir(), "ares-mem-"));
    const def = rememberTool({ outputDir: tmpdir(), memoryDir });
    const result = await def.handler(
      { name: "test-dato", description: "un dato", type: "user", body: "contenido" },
      { signal: new AbortController().signal },
    );
    expect(existsSync(join(memoryDir, "test-dato.md"))).toBe(true);
    expect(readFileSync(join(memoryDir, "MEMORY.md"), "utf8")).toContain("test-dato");
    expect(JSON.stringify(result.content)).toContain("test-dato");
  });
});
