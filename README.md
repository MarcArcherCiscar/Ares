# Ares

A Telegram bridge to your **personal Claude Code agent** — a "manager" agent that
dispatches subagents to do real engineering work, for developers. Think of it as
a private, developer-only take on the OpenClaw idea: for now it speaks only to
**Claude Code** (via the [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/typescript)).

## What it does

- 🤖 Connects a Telegram bot to a Claude **manager agent** (the Agent SDK, the
  engine behind Claude Code).
- 🧵 The manager **dispatches subagents** (via the built-in Task tool) and uses
  the full Read/Write/Edit/Bash/Grep/Glob tool surface in a project workspace.
- 🔒 **Whitelisted users only** — it ignores anyone not in your allowlist.
- 💬 **Continuous, persistent conversation per chat** (survives restarts) with
  live progress updates, plus the Agent SDK's **automatic context compaction**.
- 📁 **Per-project workspaces & instructions** — switch the working tree and
  system prompt per chat (`ares.projects.json`).
- 🧠 **Model picker** per chat (`/model opus|sonnet|haiku|<id>`).
- 📸 **Playwright screenshots** — the agent can capture a URL after UI changes
  and the image is delivered to you automatically.
- ⏰ **Scheduled / cron tasks** that run and report back to the chat.
- 🐙 **GitHub**: the agent can use the `git`/`gh` CLIs via Bash (PRs, issues, CI).
- ✨ Claude's markdown is rendered as **Telegram HTML** (code blocks, bold, …).

## Commands

| Command | What it does |
| --- | --- |
| `/new` | Start a fresh conversation (drops the session) |
| `/status` | Show current model, project, and session |
| `/projects` | List configured projects |
| `/project <name>` | Switch project (starts a fresh conversation) |
| `/model <opus\|sonnet\|haiku\|id>` | Set the model for this chat |
| `/schedule <m h dom mon dow> <prompt>` | Add a recurring task (cron) |
| `/schedules` | List scheduled tasks with next run time |
| `/unschedule <id>` | Remove a scheduled task |

## Roadmap

- [ ] Markdown → Telegram: tables and nested lists
- [ ] Interactive permission prompts (inline-keyboard tool approval)
- [ ] Multiple workspaces per user / team sharing
- [ ] First-class GitHub MCP integration (beyond the `gh` CLI)

## Setup

Requires Node.js ≥ 20.

```bash
npm install
cp .env.example .env                       # then fill in the values
cp ares.projects.example.json ares.projects.json   # optional: define projects
npx playwright install chromium            # optional: enable screenshots
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
              commands,           event mapping,      ├─► subagents, tools
              live rendering,     screenshot MCP)     └─► mcp__ares__screenshot
              photo sending)                              (Playwright)
                  │
                  ├── src/store.ts      (JSON-persisted sessions + schedules)
                  ├── src/projects.ts   (named workspaces + per-project prompts)
                  ├── src/scheduler.ts  (cron tasks via croner)
                  └── src/format.ts     (Markdown → Telegram HTML)
```

- `src/config.ts` — env loading, user allowlist, paths.
- `src/agent.ts` — wraps the Agent SDK `query()`, normalizes its message stream
  into small UI events (`status`/`text`/`result`), holds the manager prompt, and
  registers the screenshot MCP server.
- `src/tools/screenshot.ts` — in-process MCP tool that captures a URL with
  Playwright; images are written to a per-run dir and sent by the bot.
- `src/telegram.ts` — grammY bot: auth, commands, per-chat state, throttled live
  renderer, screenshot delivery.
- `src/store.ts` / `src/projects.ts` / `src/scheduler.ts` / `src/format.ts` —
  persistence, projects, cron scheduling, and output formatting.
- `src/index.ts` — entry point and startup/shutdown.
