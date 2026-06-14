// src/cli/sessions.ts — historial de conversaciones del CLI por carpeta, para
// poder retomar (y elegir cuál) tras cerrar `ares`. Cada cwd guarda una LISTA
// de conversaciones en ~/.ares/cli-sessions.json. El motor retoma vía el
// sessionId del Agent SDK.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ARES_HOME } from "../core/config.js";

export interface CliSession {
  sessionId: string;
  /** Primer encargo de la conversación — sirve de "título". */
  firstPrompt: string;
  /** Último encargo, para reconocerla. */
  lastPrompt: string;
  updatedAt: string;
}

type Store = Record<string, CliSession[]>;

function fileFor(dir: string): string {
  return join(dir, "cli-sessions.json");
}

/** Normaliza el valor de una carpeta a lista, migrando el formato viejo
 * (un único objeto por carpeta) a una lista de una entrada. */
function asList(v: unknown): CliSession[] {
  if (Array.isArray(v)) return v as CliSession[];
  if (v && typeof v === "object" && "sessionId" in v) {
    const o = v as { sessionId: string; lastPrompt?: string; updatedAt?: string };
    return [
      {
        sessionId: o.sessionId,
        firstPrompt: o.lastPrompt ?? "",
        lastPrompt: o.lastPrompt ?? "",
        updatedAt: o.updatedAt ?? new Date(0).toISOString(),
      },
    ];
  }
  return [];
}

function readStore(dir: string): Store {
  const f = fileFor(dir);
  if (!existsSync(f)) return {};
  try {
    const raw = JSON.parse(readFileSync(f, "utf8")) as Record<string, unknown>;
    const store: Store = {};
    for (const [cwd, v] of Object.entries(raw)) store[cwd] = asList(v);
    return store;
  } catch {
    return {};
  }
}

function writeStore(dir: string, store: Store): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(fileFor(dir), JSON.stringify(store, null, 2));
}

/**
 * Registra un turno: actualiza la conversación si su sessionId ya existe en esta
 * carpeta, o crea una nueva entrada (guardando el encargo como título).
 */
export function recordTurn(cwd: string, sessionId: string, prompt: string, dir: string = ARES_HOME): void {
  const store = readStore(dir);
  const list = store[cwd] ?? [];
  const now = new Date().toISOString();
  const existing = list.find((s) => s.sessionId === sessionId);
  if (existing) {
    existing.lastPrompt = prompt;
    existing.updatedAt = now;
  } else {
    list.push({ sessionId, firstPrompt: prompt, lastPrompt: prompt, updatedAt: now });
  }
  store[cwd] = list;
  writeStore(dir, store);
}

/** Conversaciones de una carpeta, de la más reciente a la más antigua. */
export function listSessions(cwd: string, dir: string = ARES_HOME): CliSession[] {
  return [...(readStore(dir)[cwd] ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** La conversación más reciente de una carpeta, o null. */
export function latestSession(cwd: string, dir: string = ARES_HOME): CliSession | null {
  return listSessions(cwd, dir)[0] ?? null;
}
