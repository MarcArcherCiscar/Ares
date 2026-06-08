import { Bot } from "grammy";
import type { AresConfig } from "./config.js";
import { runAgent } from "./agent.js";

const TELEGRAM_MAX_LEN = 4096;
/** Minimum delay between message edits, to stay well under Telegram rate limits. */
const EDIT_THROTTLE_MS = 1500;

/** Per-chat conversation state kept in memory (resets on restart). */
interface ChatState {
  sessionId?: string;
  busy: boolean;
}

export function createBot(config: AresConfig): Bot {
  const bot = new Bot(config.telegramBotToken);
  const chats = new Map<number, ChatState>();

  const getState = (chatId: number): ChatState => {
    let s = chats.get(chatId);
    if (!s) {
      s = { busy: false };
      chats.set(chatId, s);
    }
    return s;
  };

  // ── Auth: only whitelisted users get through ────────────────────────────────
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
      "👋 Ares is online. Send me a task and I'll work on it in the project workspace.\n\n" +
        "/new — start a fresh conversation\n" +
        "/status — show current session",
    ),
  );

  bot.command("new", (ctx) => {
    if (ctx.chat) getState(ctx.chat.id).sessionId = undefined;
    return ctx.reply("🧹 Started a fresh conversation.");
  });

  bot.command("status", (ctx) => {
    const s = ctx.chat ? chats.get(ctx.chat.id) : undefined;
    return ctx.reply(
      `Model: ${config.model}\n` +
        `Workspace: ${config.workspaceDir}\n` +
        `Session: ${s?.sessionId ?? "(none yet)"}`,
    );
  });

  // ── Plain text → run the manager agent ────────────────────────────────────────
  bot.on("message:text", async (ctx) => {
    const chatId = ctx.chat.id;
    const state = getState(chatId);
    const text = ctx.message.text;

    if (text.startsWith("/")) return; // unknown command, ignore

    if (state.busy) {
      await ctx.reply("⏳ Still working on the previous task — one moment.");
      return;
    }

    state.busy = true;
    await ctx.replyWithChatAction("typing").catch(() => {});

    const live = await ctx.reply("🤔 Thinking…");
    const renderer = new Renderer(bot, chatId, live.message_id);

    try {
      for await (const event of runAgent(config, {
        prompt: text,
        resumeSessionId: state.sessionId,
      })) {
        if (event.type === "status") {
          renderer.setStatus(event.text);
        } else if (event.type === "text") {
          renderer.appendText(event.text);
        } else if (event.type === "result") {
          if (event.sessionId) state.sessionId = event.sessionId;
          await renderer.finish(event.isError, event.text);
        }
      }
    } catch (err) {
      console.error("Agent run failed:", err);
      await renderer.finish(true, `❌ Error: ${(err as Error).message}`);
    } finally {
      state.busy = false;
    }
  });

  return bot;
}

/**
 * Renders a single live Telegram message during a run, then the final answer.
 * Edits are throttled; final output is split across messages if needed.
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

  /** Compose the in-progress view: a status line plus the (possibly truncated) answer. */
  private progressView(): string {
    const head = this.status ? `${this.status}\n\n` : "";
    const body = this.buffer.trim();
    const combined = head + body;
    if (combined.length <= TELEGRAM_MAX_LEN) return combined || "🤔 Thinking…";
    // Keep the tail while streaming so the user sees the latest output.
    return head + "…" + body.slice(-(TELEGRAM_MAX_LEN - head.length - 1));
  }

  private scheduleEdit(): void {
    const now = Date.now();
    const wait = Math.max(0, EDIT_THROTTLE_MS - (now - this.lastEdit));
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
    try {
      await this.bot.api.editMessageText(this.chatId, this.messageId, view);
    } catch {
      // Ignore "message is not modified" and transient edit errors.
    }
  }

  async finish(isError: boolean, resultText: string): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    // Prefer the explicit result text; fall back to streamed buffer.
    const finalText = (resultText.trim() || this.buffer.trim() || "✅ Done.").trim();
    const chunks = splitForTelegram(finalText);

    // First chunk replaces the live message; the rest are follow-ups.
    try {
      await this.bot.api.editMessageText(this.chatId, this.messageId, chunks[0]);
    } catch {
      await this.bot.api.sendMessage(this.chatId, chunks[0]).catch(() => {});
    }
    for (const chunk of chunks.slice(1)) {
      await this.bot.api.sendMessage(this.chatId, chunk).catch(() => {});
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
    if (cut < TELEGRAM_MAX_LEN * 0.5) cut = TELEGRAM_MAX_LEN; // no good newline; hard cut
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).replace(/^\n/, "");
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}
