import { Bot, InputFile, type CommandContext, type Context } from "grammy";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { AresConfig } from "./config.js";
import { runAgent } from "./agent.js";
import { Store } from "./store.js";
import { Projects } from "./projects.js";
import { Scheduler } from "./scheduler.js";
import { toTelegramHtml } from "./format.js";

const TELEGRAM_MAX_LEN = 4096;
const EDIT_THROTTLE_MS = 1500;

/** Friendly model aliases the user can type. */
const MODEL_ALIASES: Record<string, string> = {
  opus: "claude-opus-4-8",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5",
};

export function createBot(config: AresConfig, store: Store): Bot {
  const bot = new Bot(config.telegramBotToken);
  const projects = new Projects(config.projectsFile, config.workspaceDir, config.projectRoots);
  const busy = new Set<number>();

  const scheduler = new Scheduler(store, async (record) => {
    await bot.api
      .sendMessage(record.chatId, `⏰ Running scheduled task: ${record.prompt}`)
      .catch(() => {});
    await processPrompt(record.chatId, record.prompt, record.project);
  });

  /** Switch a chat to a resolved project and start a fresh session. */
  function switchProject(chatId: number, query: string): string {
    const matches = projects.resolve(query);
    if (matches.length === 0) {
      return `No project matching "${query}". Try /projects, /find <text>, or give a full path.`;
    }
    if (matches.length > 1) {
      const list = matches.slice(0, 12).map((p) => `• ${p.name} — ${p.cwd}`).join("\n");
      return `Multiple matches for "${query}":\n${list}\n\nBe more specific or paste the full path.`;
    }
    const p = matches[0];
    // Switching the working tree means context differs, so reset the session.
    store.updateChat(chatId, {
      projectName: p.name,
      projectCwd: p.cwd,
      projectInstructions: p.instructions,
      sessionId: undefined,
    });
    return `📁 Opened "${p.name}" (${p.cwd}).\n🧹 Started a fresh conversation.`;
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    if (config.allowedUserIds.size > 0 && (!userId || !config.allowedUserIds.has(userId))) {
      if (ctx.chat) {
        await ctx.reply("⛔ Not authorized. Ask the operator to whitelist your Telegram ID.");
      }
      return;
    }
    await next();
  });

  // ── Commands ─────────────────────────────────────────────────────────────────
  bot.command("start", (ctx) =>
    ctx.reply(
      "👋 Ares is online. Send a task and I'll work on it in the selected project.\n\n" +
        "/new — fresh conversation\n" +
        "/status — current model/project/session\n" +
        "/projects — list configured + discovered projects\n" +
        "/open <name|path> — open a session in a project (searches your dirs)\n" +
        "/find <text> — search your local projects\n" +
        "/rescan — refresh discovered projects\n" +
        "/model <opus|sonnet|haiku|id> — set the model\n" +
        '/schedule <m h dom mon dow> <prompt> — recurring task\n' +
        "/schedules — list scheduled tasks\n" +
        "/unschedule <id> — remove one",
    ),
  );

  bot.command("new", (ctx) => {
    if (ctx.chat) store.updateChat(ctx.chat.id, { sessionId: undefined });
    return ctx.reply("🧹 Started a fresh conversation.");
  });

  bot.command("status", (ctx) => {
    if (!ctx.chat) return;
    const rec = store.getChat(ctx.chat.id);
    const project = projects.fromRecord(rec.projectName, rec.projectCwd, rec.projectInstructions);
    return ctx.reply(
      `Model: ${rec.model ?? config.model}\n` +
        `Project: ${project.name} (${project.cwd})\n` +
        `Session: ${rec.sessionId ?? "(none yet)"}`,
    );
  });

  bot.command("projects", (ctx) => {
    if (!ctx.chat) return;
    const rec = store.getChat(ctx.chat.id);
    const currentCwd = projects.fromRecord(rec.projectName, rec.projectCwd, rec.projectInstructions).cwd;
    const mark = (cwd: string) => (cwd === currentCwd ? "▸" : " ");

    const configured = projects.configuredProjects();
    const discovered = projects.discoveredProjects();

    let msg = "Configured:\n" + configured.map((p) => `${mark(p.cwd)} ${p.name} — ${p.cwd}`).join("\n");
    if (discovered.length > 0) {
      const shown = discovered.slice(0, 30).map((p) => `${mark(p.cwd)} ${p.name} — ${p.cwd}`).join("\n");
      const more = discovered.length > 30 ? `\n  …and ${discovered.length - 30} more (use /find)` : "";
      msg += `\n\nDiscovered in your dirs:\n${shown}${more}`;
    } else {
      msg += "\n\n(No auto-discovered projects. Set ARES_PROJECTS_ROOTS to your dev folders.)";
    }
    msg += "\n\nOpen one with /open <name|path>.";
    return ctx.reply(msg);
  });

  // /open and /project are synonyms.
  const openHandler = (ctx: CommandContext<Context>) => {
    if (!ctx.chat) return;
    const query = ctx.match.trim();
    if (!query) return ctx.reply("Usage: /open <name|path>. See /projects or /find.");
    return ctx.reply(switchProject(ctx.chat.id, query));
  };
  bot.command("open", openHandler);
  bot.command("project", openHandler);

  bot.command("find", (ctx) => {
    if (!ctx.chat) return;
    const query = ctx.match.trim();
    if (!query) return ctx.reply("Usage: /find <text>.");
    const matches = projects.resolve(query);
    if (matches.length === 0) return ctx.reply(`No local project matching "${query}".`);
    const lines = matches.slice(0, 25).map((p) => `• ${p.name} — ${p.cwd}`);
    return ctx.reply(`Matches for "${query}":\n${lines.join("\n")}\n\nOpen with /open <name|path>.`);
  });

  bot.command("rescan", (ctx) => {
    const n = projects.discoveredProjects(true).length;
    return ctx.reply(`🔄 Rescanned. Found ${n} project(s) in your dirs. See /projects.`);
  });

  bot.command("model", (ctx) => {
    if (!ctx.chat) return;
    const arg = ctx.match.trim().toLowerCase();
    if (!arg) {
      const rec = store.getChat(ctx.chat.id);
      return ctx.reply(
        `Model: ${rec.model ?? config.model}\nSet with /model <opus|sonnet|haiku|id>.`,
      );
    }
    const model = MODEL_ALIASES[arg] ?? ctx.match.trim();
    store.updateChat(ctx.chat.id, { model });
    return ctx.reply(`🧠 Model set to ${model}.`);
  });

  bot.command("schedule", (ctx) => {
    if (!ctx.chat) return;
    const parts = ctx.match.trim().split(/\s+/);
    if (parts.length < 6) {
      return ctx.reply('Usage: /schedule <m h dom mon dow> <prompt>\nExample: /schedule 0 9 * * * run the test suite');
    }
    const cron = parts.slice(0, 5).join(" ");
    const prompt = parts.slice(5).join(" ");
    if (!Scheduler.isValidCron(cron)) return ctx.reply(`Invalid cron expression: "${cron}".`);
    const rec = scheduler.add(ctx.chat.id, cron, prompt, store.getChat(ctx.chat.id).projectName);
    return ctx.reply(`⏰ Scheduled [${rec.id}] "${cron}" → ${prompt}`);
  });

  bot.command("schedules", (ctx) => {
    if (!ctx.chat) return;
    const items = scheduler.list(ctx.chat.id);
    if (items.length === 0) return ctx.reply("No scheduled tasks. Add one with /schedule.");
    const lines = items.map(
      (s) => `[${s.id}] ${s.cron} → ${s.prompt}\n   next: ${s.next?.toLocaleString() ?? "n/a"}`,
    );
    return ctx.reply(lines.join("\n"));
  });

  bot.command("unschedule", (ctx) => {
    const id = ctx.match.trim();
    if (!id) return ctx.reply("Usage: /unschedule <id>. See /schedules.");
    return ctx.reply(scheduler.remove(id) ? `🗑️ Removed ${id}.` : `No schedule with id ${id}.`);
  });

  // ── Plain text → run the manager agent ────────────────────────────────────────
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith("/")) return; // unknown command, ignore
    await processPrompt(ctx.chat.id, text);
  });

  /** Core path: run the manager agent for a chat and render the result. */
  async function processPrompt(chatId: number, prompt: string, projectOverride?: string): Promise<void> {
    if (busy.has(chatId)) {
      await bot.api.sendMessage(chatId, "⏳ Still working on the previous task — one moment.").catch(() => {});
      return;
    }
    busy.add(chatId);

    const rec = store.getChat(chatId);
    // A scheduled task may target a specific project by name; otherwise use the
    // chat's currently selected (and persisted) project.
    const overrideMatch = projectOverride ? projects.resolve(projectOverride)[0] : undefined;
    const project =
      overrideMatch ??
      projects.fromRecord(rec.projectName, rec.projectCwd, rec.projectInstructions);
    const outputDir = join(config.dataDir, "runs", `${chatId}-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });

    await bot.api.sendChatAction(chatId, "typing").catch(() => {});
    const live = await bot.api.sendMessage(chatId, "🤔 Thinking…");
    const renderer = new Renderer(bot, chatId, live.message_id);

    try {
      for await (const event of runAgent(config, {
        prompt,
        resumeSessionId: rec.sessionId,
        cwd: project.cwd,
        model: rec.model,
        projectInstructions: project.instructions,
        outputDir,
      })) {
        if (event.type === "status") {
          renderer.setStatus(event.text);
        } else if (event.type === "text") {
          renderer.appendText(event.text);
        } else if (event.type === "result") {
          if (event.sessionId) store.updateChat(chatId, { sessionId: event.sessionId });
          await renderer.finish(event.isError, event.text);
        }
      }
      await sendScreenshots(chatId, outputDir);
    } catch (err) {
      console.error("Agent run failed:", err);
      await renderer.finish(true, `❌ Error: ${(err as Error).message}`);
    } finally {
      busy.delete(chatId);
      rmSync(outputDir, { recursive: true, force: true });
    }
  }

  /** Send any PNGs the screenshot tool produced during the run. */
  async function sendScreenshots(chatId: number, outputDir: string): Promise<void> {
    let files: string[] = [];
    try {
      files = readdirSync(outputDir).filter((f) => f.toLowerCase().endsWith(".png"));
    } catch {
      return;
    }
    for (const file of files.sort()) {
      const caption = file.replace(/^\d+-/, "").replace(/\.png$/i, "").replace(/_/g, " ");
      await bot.api
        .sendPhoto(chatId, new InputFile(join(outputDir, file)), { caption })
        .catch((err) => console.error("sendPhoto failed:", err));
    }
  }

  scheduler.start();
  void bot.api
    .setMyCommands([
      { command: "new", description: "Start a fresh conversation" },
      { command: "status", description: "Show model/project/session" },
      { command: "projects", description: "List configured + discovered projects" },
      { command: "open", description: "Open a session in a project (searches your dirs)" },
      { command: "find", description: "Search your local projects" },
      { command: "model", description: "Set the model" },
      { command: "schedules", description: "List scheduled tasks" },
    ])
    .catch(() => {});

  return bot;
}

/**
 * Renders a single live Telegram message during a run (plain text, throttled),
 * then the final answer formatted as Telegram HTML (with plain-text fallback).
 */
class Renderer {
  private status = "";
  private buffer = "";
  private lastEdit = 0;
  private lastRendered = "";
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly bot: Bot,
    private readonly chatId: number,
    private readonly messageId: number,
  ) {}

  setStatus(text: string): void {
    this.status = text;
    this.scheduleEdit();
  }

  appendText(text: string): void {
    this.buffer += text;
    this.scheduleEdit();
  }

  private progressView(): string {
    const head = this.status ? `${this.status}\n\n` : "";
    const body = this.buffer.trim();
    const combined = head + body;
    if (combined.length <= TELEGRAM_MAX_LEN) return combined || "🤔 Thinking…";
    return head + "…" + body.slice(-(TELEGRAM_MAX_LEN - head.length - 1));
  }

  private scheduleEdit(): void {
    const wait = Math.max(0, EDIT_THROTTLE_MS - (Date.now() - this.lastEdit));
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, wait);
  }

  private async flush(): Promise<void> {
    const view = this.progressView();
    if (view === this.lastRendered) return;
    this.lastEdit = Date.now();
    this.lastRendered = view;
    // Progress is plain text — partial markdown would produce invalid HTML.
    await this.bot.api.editMessageText(this.chatId, this.messageId, view).catch(() => {});
  }

  async finish(isError: boolean, resultText: string): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    const finalText = (resultText.trim() || this.buffer.trim() || "✅ Done.").trim();
    const chunks = splitForTelegram(finalText);

    await this.editOrSend(chunks[0], this.messageId);
    for (const chunk of chunks.slice(1)) {
      await this.send(chunk);
    }
  }

  /** Edit the live message with HTML; fall back to plain text on parse error. */
  private async editOrSend(text: string, messageId: number): Promise<void> {
    try {
      await this.bot.api.editMessageText(this.chatId, messageId, toTelegramHtml(text), {
        parse_mode: "HTML",
      });
    } catch {
      await this.bot.api
        .editMessageText(this.chatId, messageId, text)
        .catch(() => this.send(text));
    }
  }

  private async send(text: string): Promise<void> {
    try {
      await this.bot.api.sendMessage(this.chatId, toTelegramHtml(text), { parse_mode: "HTML" });
    } catch {
      await this.bot.api.sendMessage(this.chatId, text).catch(() => {});
    }
  }
}

/** Split text into Telegram-sized chunks, preferring line boundaries. */
function splitForTelegram(text: string): string[] {
  if (text.length <= TELEGRAM_MAX_LEN) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > TELEGRAM_MAX_LEN) {
    let cut = remaining.lastIndexOf("\n", TELEGRAM_MAX_LEN);
    if (cut < TELEGRAM_MAX_LEN * 0.5) cut = TELEGRAM_MAX_LEN;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).replace(/^\n/, "");
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}
