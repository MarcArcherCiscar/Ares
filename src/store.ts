import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { join } from "node:path";

/** Persisted per-chat conversation state. */
export interface ChatRecord {
  /** Claude Agent SDK session id, to resume conversation context. */
  sessionId?: string;
  /** Model override for this chat (falls back to config default). */
  model?: string;
  /** Currently selected project name (display only). */
  projectName?: string;
  /** Resolved absolute working directory for the selected project. */
  projectCwd?: string;
  /** Cached per-project instructions for the selected project. */
  projectInstructions?: string;
}

/** A recurring scheduled task. */
export interface ScheduleRecord {
  id: string;
  chatId: number;
  /** Cron expression (croner syntax). */
  cron: string;
  prompt: string;
  /** Project to run in (falls back to the chat's current project). */
  project?: string;
  createdAt: string;
}

interface StateFile {
  chats: Record<string, ChatRecord>;
  schedules: ScheduleRecord[];
}

/**
 * Tiny JSON-file-backed store. Synchronous and atomic-enough for a single
 * process: writes to a temp file then renames over the target.
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
      this.state = {
        chats: parsed.chats ?? {},
        schedules: parsed.schedules ?? [],
      };
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
    return this.state.chats[String(chatId)] ?? {};
  }

  updateChat(chatId: number, patch: Partial<ChatRecord>): ChatRecord {
    const key = String(chatId);
    const next = { ...(this.state.chats[key] ?? {}), ...patch };
    this.state.chats[key] = next;
    this.save();
    return next;
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
