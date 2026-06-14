// src/cli/sessions.ts — persistencia de la conversación del CLI por carpeta,
// para poder retomar tras cerrar `ares`. Una entrada por cwd en
// ~/.ares/cli-sessions.json. El motor retoma vía el sessionId del Agent SDK.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ARES_HOME } from "../core/config.js";

export interface CliSession {
  sessionId: string;
  updatedAt: string;
  lastPrompt: string;
}

type Store = Record<string, CliSession>;

function fileFor(dir: string): string {
  return join(dir, "cli-sessions.json");
}

function readStore(dir: string): Store {
  const f = fileFor(dir);
  if (!existsSync(f)) return {};
  try {
    return JSON.parse(readFileSync(f, "utf8")) as Store;
  } catch {
    return {};
  }
}

/** Conversación guardada para una carpeta, o null si no hay. */
export function loadSession(cwd: string, dir: string = ARES_HOME): CliSession | null {
  return readStore(dir)[cwd] ?? null;
}

/** Guarda (o reemplaza) la conversación de una carpeta. */
export function saveSession(cwd: string, sessionId: string, lastPrompt: string, dir: string = ARES_HOME): void {
  const store = readStore(dir);
  store[cwd] = { sessionId, lastPrompt, updatedAt: new Date().toISOString() };
  mkdirSync(dir, { recursive: true });
  writeFileSync(fileFor(dir), JSON.stringify(store, null, 2));
}

/** Olvida la conversación de una carpeta. */
export function clearSession(cwd: string, dir: string = ARES_HOME): void {
  const store = readStore(dir);
  if (!(cwd in store)) return;
  delete store[cwd];
  mkdirSync(dir, { recursive: true });
  writeFileSync(fileFor(dir), JSON.stringify(store, null, 2));
}
