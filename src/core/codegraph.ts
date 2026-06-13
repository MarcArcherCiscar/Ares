// src/core/codegraph.ts
import { spawnSync } from "node:child_process";

export type CodegraphStateValue = "ready" | "needs-init" | "absent";

/** Ejecuta un comando codegraph; devuelve null si el binario no existe o el spawn falla. */
export type CodegraphRunner = (args: string[], cwd: string) => { code: number; stdout: string } | null;

/** Runner por defecto: lanza el binario `codegraph` de forma síncrona. */
const defaultRunner: CodegraphRunner = (args, cwd) => {
  try {
    const r = spawnSync("codegraph", args, { cwd, encoding: "utf8", timeout: 10_000 });
    if (r.error) return null; // ENOENT: binario no instalado
    return { code: r.status ?? 1, stdout: r.stdout ?? "" };
  } catch {
    return null;
  }
};

/**
 * Estado de CodeGraph para un repo:
 * - "ready": indexado (initialized:true) → se puede conectar el MCP.
 * - "needs-init": binario presente pero repo sin indexar → ofrecer init a Marc.
 * - "absent": sin binario o salida no fiable → grep/glob, sin mención.
 *
 * Parsea `codegraph status --json <cwd>`; el exit code es 0 en ambos casos, así
 * que la señal real es el campo `initialized` del JSON.
 */
export function codegraphState(cwd: string, run: CodegraphRunner = defaultRunner): CodegraphStateValue {
  const res = run(["status", "--json", cwd], cwd);
  if (!res) return "absent";
  try {
    const parsed = JSON.parse(res.stdout) as { initialized?: boolean };
    if (parsed.initialized === true) return "ready";
    if (parsed.initialized === false) return "needs-init";
    return "absent";
  } catch {
    return "absent";
  }
}
