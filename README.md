# Ares

A Telegram bridge to your **personal Claude Code agent** — a "manager" agent that
dispatches subagents to do real engineering work, for developers. Think of it as
a private, developer-only take on the OpenClaw idea: for now it speaks only to
**Claude Code** (via the [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/typescript)).

## What it does today (milestone 1)

- 🤖 Connects a Telegram bot to a Claude **manager agent** (the Agent SDK, the
  engine behind Claude Code).
- 🧵 The manager can **dispatch subagents** (via the built-in Task tool) and use
  the full Read/Write/Edit/Bash/Grep/Glob tool surface in a project workspace.
- 🔒 **Whitelisted users only** — it ignores anyone not in your allowlist.
- 💬 **Continuous conversation per chat** with live progress updates, and the
  Agent SDK's **automatic context compaction** for long sessions.
- 🧹 `/new` to start fresh, `/status` to inspect the current session.

## Roadmap (from the original spec)

- [ ] Per-project system instructions and project switching
- [ ] Scheduled / cron runs that report back to Telegram
- [ ] 📸 Playwright screenshots of the UI after changes (as an SDK tool)
- [ ] GitHub integration (PRs, CI) surfaced in chat
- [ ] Model picker (Opus / Sonnet) per task
- [ ] Persistent session storage (currently in-memory)
- [ ] Markdown → Telegram formatting (code blocks, etc.)

## Setup

Requires Node.js ≥ 20.

```bash
npm install
cp .env.example .env   # then fill in the values
```

Fill in `.env`:

- `TELEGRAM_BOT_TOKEN` — from [@BotFather](https://t.me/BotFather).
- `TELEGRAM_ALLOWED_USER_IDS` — your numeric Telegram ID (from
  [@userinfobot](https://t.me/userinfobot)), comma-separated for multiple users.
- `ANTHROPIC_API_KEY` — for the Claude Agent SDK.
- `ARES_MODEL` — default model id, e.g. `claude-opus-4-8` or `claude-sonnet-4-6`.
- `ARES_WORKSPACE_DIR` — the directory the agent works in (defaults to CWD).

## Run

```bash
npm run dev      # watch mode
# or
npm run build && npm start
```

Then message your bot on Telegram and give it a task.

## ⚠️ Security

This agent runs with `permissionMode: "bypassPermissions"` because Telegram has
no way to host interactive per-tool approval prompts. That means it can **run
shell commands and modify files** in `ARES_WORKSPACE_DIR` autonomously.

- **Always** set `TELEGRAM_ALLOWED_USER_IDS`. An open bot = remote code execution.
- Run it in a workspace/branch you're comfortable letting an agent edit.
- Prefer running inside a container or VM for anything untrusted.

## Architecture

```
Telegram ──► src/telegram.ts ──► src/agent.ts ──► Claude Agent SDK (query)
             (bot, auth,          (manager prompt,    │
              live rendering)      event mapping)     └─► subagents, tools, MCP
```

- `src/config.ts` — env loading + the user allowlist.
- `src/agent.ts` — wraps the Agent SDK `query()` and normalizes its message
  stream into small UI events (`status` / `text` / `result`). Holds the manager
  system-prompt framing.
- `src/telegram.ts` — the grammY bot: auth middleware, per-chat session state,
  and a throttled live-message renderer.
- `src/index.ts` — entry point and startup/shutdown.
