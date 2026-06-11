// src/cli/headless.ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAgent } from "../core/agent.js";

/** Ejecuta un encargo sin UI. Devuelve el exit code (0 ok, 1 error). */
export async function runHeadless(opts: { prompt: string; model?: string }): Promise<number> {
  const outputDir = mkdtempSync(join(tmpdir(), "ares-run-"));
  let isError = false;
  let streamed = false;
  try {
    for await (const event of runAgent({
      prompt: opts.prompt,
      cwd: process.cwd(),
      model: opts.model,
      outputDir,
      permissionMode: "bypassPermissions",
      channelInstructions:
        "Modo headless: tu salida va a stdout de un script. Responde solo con el resultado, sin saludos.",
    })) {
      if (event.type === "delta") {
        streamed = true;
        process.stdout.write(event.text);
      } else if (event.type === "result") {
        isError = event.isError;
        if (!streamed && event.text) process.stdout.write(event.text);
        process.stdout.write("\n");
        if (event.isError && event.text) process.stderr.write(`ares: ${event.text}\n`);
      }
    }
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
  return isError ? 1 : 0;
}
