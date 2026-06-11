import { Cron } from "croner";
import { randomUUID } from "node:crypto";
import type { Store, ScheduleRecord } from "./store.js";

/** Callback that runs a scheduled prompt for a chat and posts the result. */
export type ScheduleRunner = (record: ScheduleRecord) => Promise<void>;

/**
 * Registers cron jobs for persisted schedules and keeps them in sync as the
 * user adds/removes them. Uses croner for cron parsing and timing.
 */
export class Scheduler {
  private readonly jobs = new Map<string, Cron>();

  constructor(
    private readonly store: Store,
    private readonly run: ScheduleRunner,
  ) {}

  /** Register all persisted schedules. Call once at startup. */
  start(): void {
    for (const record of this.store.listSchedules()) {
      this.register(record);
    }
  }

  /** Validate a cron expression without scheduling it. */
  static isValidCron(expr: string): boolean {
    try {
      const probe = new Cron(expr, { maxRuns: 0 });
      probe.stop();
      return true;
    } catch {
      return false;
    }
  }

  add(chatId: number, cron: string, prompt: string, project?: string): ScheduleRecord {
    const record: ScheduleRecord = {
      id: randomUUID().slice(0, 8),
      chatId,
      cron,
      prompt,
      project,
      createdAt: new Date().toISOString(),
    };
    this.store.addSchedule(record);
    this.register(record);
    return record;
  }

  remove(id: string): boolean {
    this.jobs.get(id)?.stop();
    this.jobs.delete(id);
    return this.store.removeSchedule(id);
  }

  list(chatId: number): Array<ScheduleRecord & { next: Date | null }> {
    return this.store.listSchedules(chatId).map((r) => ({
      ...r,
      next: this.jobs.get(r.id)?.nextRun() ?? null,
    }));
  }

  private register(record: ScheduleRecord): void {
    try {
      const job = new Cron(record.cron, () => {
        void this.run(record).catch((err) => console.error(`Schedule ${record.id} failed:`, err));
      });
      this.jobs.set(record.id, job);
    } catch (err) {
      console.error(`Could not register schedule ${record.id} (${record.cron}):`, err);
    }
  }
}
