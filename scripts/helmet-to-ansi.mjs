// Genera src/cli/ui/helmet.ts: el casco de Ares como arte ANSI de medios bloques.
// Uso: sips -z <px> <px> -s format bmp assets/ares-helmet.png --out /tmp/helmet.bmp
//      node scripts/helmet-to-ansi.mjs /tmp/helmet.bmp src/cli/ui/helmet.ts
import { readFileSync, writeFileSync } from "node:fs";

const [bmpPath, outPath] = process.argv.slice(2);
const buf = readFileSync(bmpPath);
const dataOffset = buf.readUInt32LE(10);
const width = buf.readInt32LE(18);
const rawHeight = buf.readInt32LE(22);
const bpp = buf.readUInt16LE(28);
if (bpp !== 24) throw new Error(`BMP de ${bpp}bpp no soportado (esperaba 24)`);
const height = Math.abs(rawHeight);
const topDown = rawHeight < 0;
const rowSize = Math.ceil((width * 3) / 4) * 4;

function px(x, y) {
  const row = topDown ? y : height - 1 - y;
  const off = dataOffset + row * rowSize + x * 3;
  return [buf[off + 2], buf[off + 1], buf[off]]; // BGR → RGB
}

const lines = [];
for (let y = 0; y < height; y += 2) {
  let line = "";
  let lastFg = "", lastBg = "";
  for (let x = 0; x < width; x++) {
    const [tr, tg, tb] = px(x, y);
    const [br, bg_, bb] = y + 1 < height ? px(x, y + 1) : [0, 0, 0];
    const fg = `\\u001b[38;2;${tr};${tg};${tb}m`;
    const bg = `\\u001b[48;2;${br};${bg_};${bb}m`;
    if (fg !== lastFg) { line += fg; lastFg = fg; }
    if (bg !== lastBg) { line += bg; lastBg = bg; }
    line += "\\u2580"; // ▀
  }
  line += "\\u001b[0m";
  lines.push(line);
}

const ts = `// GENERADO por scripts/helmet-to-ansi.mjs a partir de assets/ares-helmet.png — no editar a mano.
/** El casco de Ares en arte ANSI de medios bloques (${width}×${height}px → ${lines.length} filas). */
export const HELMET: string[] = [
${lines.map((l) => `  "${l}",`).join("\n")}
];
`;
writeFileSync(outPath, ts);
console.log(`OK: ${outPath} (${lines.length} filas × ${width} cols)`);
