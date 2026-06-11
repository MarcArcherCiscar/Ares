import { query } from "@anthropic-ai/claude-agent-sdk";
import type { AresConfig } from "../telegram/config.js";
import { createScreenshotServer } from "./toolbelt/screenshot.js";

/**
 * How the manager agent should behave. The `claude_code` preset already gives it
 * the full tool surface (Read/Write/Edit/Bash/Grep/Glob + the Task tool for
 * spawning subagents). This append frames it as the "gerente" from the spec.
 */
const MANAGER_PROMPT_APPEND = `You are Ares, a senior engineering "manager" agent operating over Telegram.

You are talking to a developer through a chat bridge, so:
- Keep replies tight and skimmable. This is a phone screen, not a terminal.
- For non-trivial or parallelizable work, dispatch subagents with the Task tool
  instead of doing everything inline. Summarize what each subagent found.
- When you change files or run commands, say what you did in one or two lines.
  Do not paste long diffs or full file contents unless explicitly asked.
- If a request is ambiguous, ask one focused question rather than guessing.
- After making UI changes, use the screenshot tool (mcp__ares__screenshot) to
  capture the result — it is delivered to the user automatically.
- You may use the gh and git CLIs via Bash for GitHub work (PRs, issues, CI).`;

export interface AgentEventStatus {
  type: "status";
  text: string;
}
export interface AgentEventText {
  type: "text";
  text: string;
}
export interface AgentEventResult {
  type: "result";
  sessionId: string | undefined;
  isError: boolean;
  text: string;
}
export type AgentEvent = AgentEventStatus | AgentEventText | AgentEventResult;

export interface RunOptions {
  prompt: string;
  /** Resume a prior Agent SDK session to keep conversation context. */
  resumeSessionId?: string;
  /** Optional per-project system prompt appended to the manager framing. */
  projectInstructions?: string;
  /** Working directory for this run (the selected project's cwd). */
  cwd: string;
  /** Model override for this run (falls back to the configured default). */
  model?: string;
  /** Directory screenshots are written to (sent to the user after the run). */
  outputDir: string;
}

/**
 * Run one turn of the manager agent and stream normalized events.
 * Translates the Agent SDK's raw message stream into a small, UI-friendly set
 * of events the Telegram layer can render.
 */
export async function* runAgent(
  config: AresConfig,
  opts: RunOptions,
): AsyncGenerator<AgentEvent> {
  let append = MANAGER_PROMPT_APPEND;
  if (opts.projectInstructions) {
    append += `\n\n# Project instructions\n${opts.projectInstructions}`;
  }

  let sessionId: string | undefined = opts.resumeSessionId;

  const screenshotServer = createScreenshotServer(opts.outputDir);

  const stream = query({
    prompt: opts.prompt,
    options: {
      model: opts.model ?? config.model,
      cwd: opts.cwd,
      maxTurns: config.maxTurns,
      systemPrompt: { type: "preset", preset: "claude_code", append },
      // Telegram cannot host interactive permission prompts, so the agent runs
      // autonomously. Safe only because users are whitelisted in config.
      permissionMode: "bypassPermissions",
      mcpServers: {
        ares: { type: "sdk", name: "ares", instance: screenshotServer.instance },
      },
      ...(opts.resumeSessionId ? { resume: opts.resumeSessionId } : {}),
    },
  });

  for await (const message of stream) {
    switch (message.type) {
      case "system": {
        if (message.subtype === "init") {
          sessionId = message.session_id;
        }
        break;
      }
      case "assistant": {
        for (const block of message.message.content) {
          if (block.type === "text" && block.text.trim().length > 0) {
            yield { type: "text", text: block.text };
          } else if (block.type === "tool_use") {
            yield { type: "status", text: describeToolUse(block.name, block.input) };
          }
        }
        break;
      }
      case "result": {
        const text =
          message.subtype === "success" && typeof message.result === "string"
            ? message.result
            : "";
        yield {
          type: "result",
          sessionId: message.session_id ?? sessionId,
          isError: message.subtype !== "success",
          text,
        };
        break;
      }
      default:
        break;
    }
  }
}

/** Turn a tool_use block into a short human-readable status line. */
function describeToolUse(name: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  switch (name) {
    case "Task":
      return `🧵 Dispatching subagent: ${str(i.description) ?? str(i.subagent_type) ?? "task"}`;
    case "Bash":
      return `💻 ${truncate(str(i.command) ?? "command", 80)}`;
    case "Read":
      return `📖 Reading ${str(i.file_path) ?? "file"}`;
    case "Write":
      return `✍️ Writing ${str(i.file_path) ?? "file"}`;
    case "Edit":
      return `✏️ Editing ${str(i.file_path) ?? "file"}`;
    case "Grep":
      return `🔎 Searching: ${truncate(str(i.pattern) ?? "", 60)}`;
    case "Glob":
      return `🗂️ Listing ${str(i.pattern) ?? "files"}`;
    case "mcp__ares__screenshot":
      return `📸 Screenshotting ${str(i.url) ?? "page"}`;
    default:
      return `🔧 ${name.replace(/^mcp__\w+__/, "")}`;
  }
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
