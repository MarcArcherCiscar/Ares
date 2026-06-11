// src/core/agent.ts
import { query } from "@anthropic-ai/claude-agent-sdk";
import { loadUserConfig } from "./config.js";
import { loadSoul } from "./soul.js";
import { Memory } from "./memory.js";
import { buildToolbelt } from "./toolbelt/index.js";

export type PermissionResult =
  | { behavior: "allow"; updatedInput?: Record<string, unknown> }
  | { behavior: "deny"; message: string };

/** Callback de permisos que cada canal implementa a su manera (CLI: prompt; Telegram: n/a — bypass). */
export type PermissionCallback = (
  toolName: string,
  input: Record<string, unknown>,
) => Promise<PermissionResult>;

export type AgentEvent =
  | { type: "status"; text: string } // "usando tool X" — para indicadores de progreso
  | { type: "delta"; text: string } // texto incremental (UIs en vivo: CLI)
  | { type: "text"; text: string } // bloque de texto completo (Telegram)
  | { type: "result"; sessionId: string | undefined; isError: boolean; text: string };

export interface RunOptions {
  prompt: string;
  /** Working directory del agente (el repo/proyecto). */
  cwd: string;
  /** Resume de una sesión previa del SDK. */
  resumeSessionId?: string;
  /** Override puntual del modelo; por defecto, la cadena de ~/.ares/config.json. */
  model?: string;
  /** Instrucciones del proyecto (CLAUDE.md / .ares.md), van tras el alma. */
  projectInstructions?: string;
  /** Instrucciones específicas del canal (p. ej. "esto es Telegram, sé breve"). */
  channelInstructions?: string;
  /** Directorio donde las tools dejan artefactos (screenshots…). */
  outputDir: string;
  /** 'bypassPermissions' para canales sin UI de confirmación (Telegram, headless). */
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions";
  /** Confirmación interactiva de tools (CLI). Si se pasa, permissionMode debe permitir preguntar. */
  canUseTool?: PermissionCallback;
  maxTurns?: number;
}

/**
 * Única puerta al Agent SDK. Compone alma + memoria + toolbelt + modelo y
 * traduce el stream crudo del SDK a eventos que cualquier canal renderiza.
 */
export async function* runAgent(opts: RunOptions): AsyncGenerator<AgentEvent> {
  const cfg = loadUserConfig();
  const memoryIndex = new Memory().index();

  const append = [
    loadSoul(),
    memoryIndex
      ? `# Memoria de Marc\n\nÍndice de recuerdos (lee el archivo en ~/.ares/memory/ si necesitas el detalle):\n\n${memoryIndex}`
      : "# Memoria de Marc\n\n(Aún sin recuerdos. Usa mcp__ares__remember cuando aprendas algo duradero.)",
    opts.channelInstructions ? `# Canal\n\n${opts.channelInstructions}` : "",
    opts.projectInstructions ? `# Instrucciones del proyecto\n\n${opts.projectInstructions}` : "",
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  const model = opts.model ?? cfg.models[0];
  const fallbacks = opts.model ? [] : cfg.models.slice(1);
  // 'adaptive' requiere Opus 4.6+/Fable; con haiku (smoke tests) se desactiva.
  const thinking =
    cfg.thinking === "adaptive" && !model.includes("haiku")
      ? ({ type: "adaptive" } as const)
      : ({ type: "disabled" } as const);

  let sessionId: string | undefined = opts.resumeSessionId;

  const stream = query({
    prompt: opts.prompt,
    options: {
      model,
      ...(fallbacks.length > 0 ? { fallbackModel: fallbacks.join(",") } : {}),
      cwd: opts.cwd,
      maxTurns: opts.maxTurns ?? cfg.maxTurns,
      systemPrompt: { type: "preset", preset: "claude_code", append },
      permissionMode: opts.permissionMode ?? "acceptEdits",
      ...(opts.canUseTool
        ? { canUseTool: (name: string, input: Record<string, unknown>) => opts.canUseTool!(name, input) }
        : {}),
      thinking,
      includePartialMessages: true,
      mcpServers: { ares: buildToolbelt({ outputDir: opts.outputDir }) },
      ...(opts.resumeSessionId ? { resume: opts.resumeSessionId } : {}),
    },
  });

  for await (const message of stream) {
    switch (message.type) {
      case "system": {
        if (message.subtype === "init") sessionId = message.session_id;
        break;
      }
      case "stream_event": {
        const ev = message.event;
        if (ev?.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) {
          yield { type: "delta", text: ev.delta.text };
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
          message.subtype === "success" && typeof message.result === "string" ? message.result : "";
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
    case "mcp__ares__remember":
      return `🧠 Guardando recuerdo: ${str(i.name) ?? ""}`;
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
