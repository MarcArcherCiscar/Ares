// scripts/setup.mjs — configura las capacidades opcionales de Ares.
// Scrapling se instala en un venv propio de Ares (~/.ares/venv), aislado del
// Python del sistema: sin PEP 668, sin ensuciar nada, vive dentro de Ares.
// Idempotente: re-ejecutar es seguro.
//
// Uso: npm run setup
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";

const VENV = join(homedir(), ".ares", "venv");
const BIN = process.platform === "win32" ? "Scripts" : "bin";
const VENV_PY = join(VENV, BIN, process.platform === "win32" ? "python.exe" : "python");

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  return { ok: !r.error && r.status === 0, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

console.log("⚙️  Ares setup\n");
console.log("🕷️  Scrapling (scraping por defecto)");

const sysPython = run("python3", ["--version"]).ok ? "python3" : run("python", ["--version"]).ok ? "python" : null;
if (!sysPython) {
  console.log("   ⚠️  No encuentro python3. Instálalo y vuelve a `npm run setup`.");
  console.log("   (El resto de Ares funciona igual sin Scrapling.)\n");
  process.exit(0);
}

// 1. venv propio de Ares
if (!existsSync(VENV_PY)) {
  console.log(`   Creando entorno aislado en ${VENV}…`);
  if (!run(sysPython, ["-m", "venv", VENV]).ok) {
    console.log("   ⚠️  No pude crear el venv. ¿Está `python3 -m venv` disponible?\n");
    process.exit(0);
  }
}

// 2. scrapling dentro del venv
if (run(VENV_PY, ["-c", "import scrapling"]).ok) {
  console.log("   ✓ scrapling ya está en el venv de Ares.\n");
} else {
  console.log("   Instalando scrapling en el venv…");
  const r = run(VENV_PY, ["-m", "pip", "install", "scrapling"]);
  if (r.ok && run(VENV_PY, ["-c", "import scrapling"]).ok) {
    console.log("   ✓ scrapling instalado en " + VENV_PY + "\n");
  } else {
    console.log("   ⚠️  Falló la instalación. Inténtalo a mano:");
    console.log(`        ${VENV_PY} -m pip install scrapling`);
    console.log("   (Ares funciona igual; lo reintentará al ir a scrapear.)\n");
  }
}

console.log("✅ Setup terminado.");
