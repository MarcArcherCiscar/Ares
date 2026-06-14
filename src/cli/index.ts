#!/usr/bin/env node
// src/cli/index.ts
const args = process.argv.slice(2);

function takeFlagValue(long: string, short?: string): string | undefined {
  const i = args.findIndex((a) => a === long || (short !== undefined && a === short));
  if (i === -1) return undefined;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
}

function takeFlag(...names: string[]): boolean {
  const i = args.findIndex((a) => names.includes(a));
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
}

const model = takeFlagValue("--model", "-m");
// Por defecto Ares ejecuta sin pedir confirmación (como Claude con
// --dangerously-skip-permissions). `--safe` reactiva las confirmaciones de
// comandos para esta sesión.
const safe = takeFlag("--safe");
// Retoma la conversación previa de esta carpeta (la guardada al cerrar).
const continueSession = takeFlag("--continue", "-c");
const printPrompt = takeFlagValue("--print", "-p");

if (args.includes("--help") || args.includes("-h")) {
  console.log(
    [
      "ares — tu asistente personal",
      "",
      "Uso:",
      "  ares                     sesión interactiva en el directorio actual",
      '  ares -p "<encargo>"      modo headless: ejecuta y sale (scripts/cron)',
      "  ares -m <modelo>         override del modelo (id o alias)",
      "  ares -c                  retoma la conversación previa de esta carpeta",
      "  ares --safe              pide confirmación antes de cada comando",
      "",
      "Dentro de la sesión: /retomar (seguir la previa) · /nueva (empezar limpio) · /salir",
    ].join("\n"),
  );
  process.exit(0);
}

if (printPrompt !== undefined) {
  if (!printPrompt.trim()) {
    console.error('ares: -p necesita un encargo. Ej: ares -p "corre los tests"');
    process.exit(2);
  }
  const { runHeadless } = await import("./headless.js");
  process.exit(await runHeadless({ prompt: printPrompt, model }));
} else {
  const { runInteractive } = await import("./ui/app.js");
  await runInteractive({ model, safe, continueSession });
}
