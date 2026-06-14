import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { join } from "node:path";

/** One conversation thread, scoped to a project (keyed by its cwd). */
export interface ProjectSession {
  name: string;
  /** Absolute working directory for this project. */
  cwd: string;
  /** Per-project system instructions (e.g. from CLAUDE.md). */
  instructions?: string;
  /** Claude Agent SDK session id, to resume this project's conversation. */
  sessionId?: string;
  updatedAt: string;
}

/** Una conversación del historial de un proyecto (para poder elegir cuál retomar). */
export interface Conversation {
  sessionId: string;
  firstPrompt: string;
  lastPrompt: string;
  updatedAt: string;
}

/** Persisted per-chat state: a model and one conversation per project. */
export interface ChatRecord {
  /** Model override for this chat (falls back to config default). */
  model?: string;
  /** cwd of the currently selected project (key into `projects`). */
  currentCwd?: string;
  /** Per-project conversation threads, keyed by cwd. */
  projects: Record<string, ProjectSession>;
  /** Historial de conversaciones por proyecto (cwd → lista), para retomar. */
  conversations?: Record<string, Conversation[]>;
}

/** A recurring scheduled task. */
export interface ScheduleRecord {
  id: string;
  chatId: number;
  cron: string;
  prompt: string;
  /** Project name/query to run in (falls back to the chat's current project). */
  project?: string;
  createdAt: string;
}

interface StateFile {
  chats: Record<string, ChatRecord>;
  schedules: ScheduleRecord[];
}

/** Reference to a project we want to open or run in. */
export interface ProjectRef {
  name: string;
  cwd: string;
  instructions?: string;
}

/**
 * JSON-file-backed store. Synchronous and atomic-enough for a single process:
 * writes to a temp file then renames over the target.
 */
export class Store {
  private state: StateFile = { chats: {}, schedules: [] };
  private readonly file: string;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.file = join(dataDir, "state.json");
    this.load();
  }

  private load(): void {
    if (!existsSync(this.file)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.file, "utf8")) as Partial<StateFile>;
      this.state = { chats: parsed.chats ?? {}, schedules: parsed.schedules ?? [] };
    } catch (err) {
      console.error(`Could not read ${this.file}, starting fresh:`, err);
    }
  }

  private save(): void {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    renameSync(tmp, this.file);
  }

  getChat(chatId: number): ChatRecord {
    const rec = this.state.chats[String(chatId)];
    return rec ?? { projects: {} };
  }

  private mutate(chatId: number, fn: (rec: ChatRecord) => void): ChatRecord {
    const key = String(chatId);
    const rec = this.state.chats[key] ?? { projects: {} };
    fn(rec);
    this.state.chats[key] = rec;
    this.save();
    return rec;
  }

  setModel(chatId: number, model: string): void {
    this.mutate(chatId, (rec) => {
      rec.model = model;
    });
  }

  /** The chat's currently selected project conversation, if any. */
  current(chatId: number): ProjectSession | undefined {
    const rec = this.getChat(chatId);
    return rec.currentCwd ? rec.projects[rec.currentCwd] : undefined;
  }

  /**
   * Create or update a project's conversation entry. Preserves an existing
   * sessionId so switching back to a project resumes it. Optionally makes it
   * the chat's current project.
   */
  upsertProject(chatId: number, ref: ProjectRef, opts: { setCurrent: boolean }): ProjectSession {
    let result!: ProjectSession;
    this.mutate(chatId, (rec) => {
      const existing = rec.projects[ref.cwd];
      const session: ProjectSession = {
        name: ref.name,
        cwd: ref.cwd,
        instructions: ref.instructions,
        sessionId: existing?.sessionId,
        updatedAt: new Date().toISOString(),
      };
      rec.projects[ref.cwd] = session;
      if (opts.setCurrent) rec.currentCwd = ref.cwd;
      result = session;
    });
    return result;
  }

  setSession(chatId: number, cwd: string, sessionId: string): void {
    this.mutate(chatId, (rec) => {
      const s = rec.projects[cwd];
      if (s) {
        s.sessionId = sessionId;
        s.updatedAt = new Date().toISOString();
      }
    });
  }

  clearSession(chatId: number, cwd: string): void {
    this.mutate(chatId, (rec) => {
      const s = rec.projects[cwd];
      if (s) {
        s.sessionId = undefined;
        s.updatedAt = new Date().toISOString();
      }
    });
  }

  listProjects(chatId: number): ProjectSession[] {
    return Object.values(this.getChat(chatId).projects).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }

  /** Registra un turno en el historial de conversaciones del proyecto (upsert por sessionId). */
  recordConversation(chatId: number, cwd: string, sessionId: string, prompt: string): void {
    this.mutate(chatId, (rec) => {
      const all = rec.conversations ?? (rec.conversations = {});
      const list = all[cwd] ?? (all[cwd] = []);
      const now = new Date().toISOString();
      const existing = list.find((c) => c.sessionId === sessionId);
      if (existing) {
        existing.lastPrompt = prompt;
        existing.updatedAt = now;
      } else {
        list.push({ sessionId, firstPrompt: prompt, lastPrompt: prompt, updatedAt: now });
      }
    });
  }

  /** Conversaciones de un proyecto, de la más reciente a la más antigua. */
  listConversations(chatId: number, cwd: string): Conversation[] {
    const list = this.getChat(chatId).conversations?.[cwd] ?? [];
    return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  listSchedules(chatId?: number): ScheduleRecord[] {
    return chatId === undefined
      ? [...this.state.schedules]
      : this.state.schedules.filter((s) => s.chatId === chatId);
  }

  addSchedule(record: ScheduleRecord): void {
    this.state.schedules.push(record);
    this.save();
  }

  removeSchedule(id: string): boolean {
    const before = this.state.schedules.length;
    this.state.schedules = this.state.schedules.filter((s) => s.id !== id);
    const removed = this.state.schedules.length < before;
    if (removed) this.save();
    return removed;
  }
}
