# Ares

El asistente personal de Marc: un agente con alma propia construido sobre el
[Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/typescript), con
dos canales que comparten cerebro, memoria y doctrina.

- **`ares`** — CLI interactivo en cualquier repo (UI Ink, streaming, confirmación de comandos).
- **`ares -p "<encargo>"`** — modo headless para scripts, cron y puentes.
- **Bot de Telegram** — el puente original: proyectos, sesiones persistentes, schedules, screenshots.

## Arquitectura

`src/core/` (alma + protocolos + memoria + toolbelt + wrapper del SDK) es la única
capa que toca el Agent SDK; `src/cli/` y `src/telegram/` solo renderizan su stream
de eventos.

- **Modelos**: cadena de preferencia en `~/.ares/config.json` (default
  `claude-fable-5` → `claude-opus-4-8`), auth vía la sesión de Claude Code
  (suscripción) o `CLAUDE_CODE_OAUTH_TOKEN`. `ares -m <modelo>` para override puntual.
- **Memoria**: `~/.ares/memory/` — un hecho por archivo + índice `MEMORY.md`,
  compartida entre canales. Ares guarda recuerdos con la tool `remember`.
- **Toolbelt**: una tool = un archivo en `src/core/toolbelt/` + una línea en el
  registro. Trae `remember` y `screenshot`.
- **Alma**: `src/core/soul/` — identidad + doctrina de trabajo (verificar antes
  de afirmar, reproducir antes de teorizar, buscar antes de crear).

## Identidad

El avatar de Ares vive en `assets/`:

- `ares-helmet.png` — original 1254×1254 (casco espartano, Ares Blue sobre Ink).
- `ares-avatar-640.png` — para el bot de Telegram: BotFather → `/setuserpic`.
- `ares-icon-512.png` — icono genérico (apps, favicon base).

Paleta: Ares Blue `#2F6BFF` · Spark `#34E0FF` · Sky `#8FB3FF` · Gold `#FFC53D` ·
Ember `#FF5C5C` · Laurel `#38E08A` · Steel `#8B98B0` · Ink `#0B1220`.

## El canal de Telegram

- 🤖 Connects a Telegram bot to a Claude **manager agent** (the Agent SDK, the
  engine behind Claude Code).
- 🧵 The manager **dispatches subagents** (via the built-in Task tool) and uses
  the full Read/Write/Edit/Bash/Grep/Glob tool surface in a project workspace.
- 🔒 **Whitelisted users only** — it ignores anyone not in your allowlist.
- 💬 **Continuous, persistent conversation per chat** (survives restarts) with
  live progress updates, plus the Agent SDK's **automatic context compaction**.
- 📁 **Per-project workspaces & instructions** — switch the working tree and
  system prompt per chat (`ares.projects.json`).
- 🔍 **Zero-config project discovery** — Ares searches your home directory
  recursively, so you just say `/open dafne-api` (or `/open dafne api`) and it
  finds `~/proyectos/dafne-api` on its own. Fuzzy name matching; picks up
  `CLAUDE.md`/`.ares.md` as that project's instructions.
- 🧵 **One conversation per project** — each project keeps its own thread.
  `/open dafne-api` and `/open dafne-admin` are independent and resume right
  where you left them; `/sessions` lists them all.
- 🧠 **Model picker** per chat (`/model opus|sonnet|haiku|<id>`).
- 📸 **Playwright screenshots** — the agent can capture a URL after UI changes
  and the image is delivered to you automatically.
- ⏰ **Scheduled / cron tasks** that run and report back to the chat.
- 🐙 **GitHub**: the agent can use the `git`/`gh` CLIs via Bash (PRs, issues, CI).
- ✨ Claude's markdown is rendered as **Telegram HTML** (code blocks, bold, …).

## Commands

| Command | What it does |
| --- | --- |
| `/new` | Start a fresh conversation for the **current** project |
| `/status` | Show current model, project, and session |
| `/projects` | List configured **and** auto-discovered projects |
| `/open <name\|path>` | Open a project (Ares searches your folders) and switch to its conversation; `/project` is a synonym |
| `/find <text>` | Search your local projects |
| `/sessions` | List your per-project conversations (which is active, last used) |
| `/rescan` | Refresh the discovered-projects list |
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
- `ARES_PROJECTS_ROOTS` — **optional**. Folders to search for your projects. Leave
  it unset and Ares searches your whole home directory recursively (zero-config).
  Set it only to narrow/speed up the search, e.g. `~/proyectos,~/work`.

## Run

```bash
npm run dev      # watch mode
# or
npm run build && npm start
```

Then message your bot on Telegram and give it a task.

## Opening projects & per-project conversations

You don't define projects anywhere — just tell Ares which one:

```
/open dafne-api      → Ares finds ~/proyectos/dafne-api and switches to it
/open dafne api      → fuzzy: spaces/hyphens/underscores are equivalent
/open ~/work/api     → or give a path directly
/find dafne          → search if you don't remember the exact name
/projects            → everything discovered (+ configured)
```

A directory counts as a project when it contains a marker (`.git`,
`package.json`, `pyproject.toml`, `go.mod`, …). If it has a `CLAUDE.md` or
`.ares.md`, that file becomes the project's system instructions automatically.

**Each project keeps its own conversation.** `/open dafne-api` and
`/open dafne-admin` are separate threads — switch between them and each resumes
where you left off, with its own context. `/sessions` lists them; `/new` starts
a fresh thread for the project you're currently in (the others are untouched).

## Can the bot message me first?

Telegram does **not** let a bot start a conversation with you out of the blue —
you must press **Start** (or message it) once. After that, Ares can message you
whenever it wants: that's how **scheduled tasks** deliver their results, and how
screenshots are pushed to you. So the flow is: open the bot once, and from then
on it can reach you proactively.

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
