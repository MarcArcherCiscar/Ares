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
  | { type: "thinking"; text: string } // razonamiento incremental (CLI lo muestra atenuado)
  | { type: "todos"; todos: TodoItem[] } // lista de pasos de TodoWrite (protocolo step-by-step)
  | { type: "result"; sessionId: string | undefined; isError: boolean; text: string };

export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
}

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
  // display 'summarized' es imprescindible: sin él los thinking_delta llegan
  // con thinking:"" (solo estimated_tokens) y no hay razonamiento que mostrar.
  const thinking =
    cfg.thinking === "adaptive" && !model.includes("haiku")
      ? ({ type: "adaptive", display: "summarized" } as const)
      : ({ type: "disabled" } as const);

  let sessionId: string | undefined = opts.resumeSessionId;

  // El modo de entrada streaming es obligatorio siempre: tanto canUseTool como
  // los servidores MCP in-process (el toolbelt) lo requieren — con prompt string
  // el callback de permisos se ignora y las tools del toolbelt nunca conectan
  // (verificado empíricamente en SDK 0.3.173).
  async function* singleMessage(prompt: string) {
    yield {
      type: "user" as const,
      message: { role: "user" as const, content: prompt },
      parent_tool_use_id: null,
      session_id: "",
    };
  }

  // Refuerzo de doctrina: tras el primer cambio de código del run, se inyecta
  // una sola vez el recordatorio del protocolo de verificación (igual que el
  // harness de Claude recuerda en el momento justo, no solo en el prompt).
  let verifyReminderSent = false;
  const postEditReminder = async () => {
    if (verifyReminderSent) return {};
    verifyReminderSent = true;
    return {
      hookSpecificOutput: {
        hookEventName: "PostToolUse" as const,
        additionalContext:
          "Recordatorio (protocols/verification.md): has cambiado código. Antes de afirmar que algo funciona o darlo por hecho, ejecuta la comprobación correspondiente (tests, build, ejecución real) y reporta la evidencia.",
      },
    };
  };

  // Lista de pasos (protocolo step-by-step): el id de cada tarea solo viaja en
  // los hooks TaskCreated/TaskCompleted; los cambios a in_progress llegan como
  // tool_use de TaskUpdate. Los hooks no pueden hacer yield, así que actualizan
  // este mapa y el loop de mensajes drena el estado cuando cambia.
  const tasks = new Map<string, TodoItem>();
  let todosDirty = false;
  const onTaskCreated = async (input: unknown) => {
    const i = input as { task_id?: string; task_subject?: string };
    if (i.task_id && i.task_subject) {
      tasks.set(i.task_id, { content: i.task_subject, status: "pending" });
      todosDirty = true;
    }
    return {};
  };
  const onTaskCompleted = async (input: unknown) => {
    const i = input as { task_id?: string };
    const task = i.task_id ? tasks.get(i.task_id) : undefined;
    if (task) {
      task.status = "completed";
      todosDirty = true;
    }
    return {};
  };

  const stream = query({
    prompt: singleMessage(opts.prompt),
    options: {
      model,
      ...(fallbacks.length > 0 ? { fallbackModel: fallbacks.join(",") } : {}),
      cwd: opts.cwd,
      maxTurns: opts.maxTurns ?? cfg.maxTurns,
      systemPrompt: { type: "preset", preset: "claude_code", append },
      hooks: {
        PostToolUse: [{ matcher: "Write|Edit|MultiEdit|NotebookEdit", hooks: [postEditReminder] }],
        TaskCreated: [{ hooks: [onTaskCreated] }],
        TaskCompleted: [{ hooks: [onTaskCompleted] }],
      },
      permissionMode: opts.permissionMode ?? "acceptEdits",
      ...(opts.canUseTool
        ? {
            canUseTool: async (name: string, input: Record<string, unknown>) => {
              const r = await opts.canUseTool!(name, input);
              return r.behavior === "allow" ? { ...r, updatedInput: r.updatedInput ?? input } : r;
            },
          }
        : {}),
      thinking,
      includePartialMessages: true,
      mcpServers: { ares: buildToolbelt({ outputDir: opts.outputDir }) },
      ...(opts.resumeSessionId ? { resume: opts.resumeSessionId } : {}),
    },
  });

  for await (const message of stream) {
    if (todosDirty) {
      todosDirty = false;
      yield { type: "todos", todos: [...tasks.values()].map((t) => ({ ...t })) };
    }
    switch (message.type) {
      case "system": {
        if (message.subtype === "init") sessionId = message.session_id;
        break;
      }
      case "stream_event": {
        // Finding #5: skip stream events from subagents (parent_tool_use_id !== null)
        if (message.parent_tool_use_id !== null) break;
        const ev = message.event;
        if (ev?.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) {
          yield { type: "delta", text: ev.delta.text };
        } else if (ev?.type === "content_block_delta" && ev.delta?.type === "thinking_delta" && ev.delta.thinking) {
          yield { type: "thinking", text: ev.delta.thinking };
        }
        break;
      }
      case "assistant": {
        // Finding #5: skip assistant messages from subagents (parent_tool_use_id !== null)
        if (message.parent_tool_use_id !== null) break;
        for (const block of message.message.content) {
          if (block.type === "text" && block.text.trim().length > 0) {
            yield { type: "text", text: block.text };
          } else if (block.type === "tool_use" && block.name === "TaskUpdate") {
            // Transiciones de estado (in_progress, completed, deleted); las
            // altas y los completados también llegan por hooks con su id.
            const input = block.input as { taskId?: string; status?: TodoItem["status"] | "deleted" };
            const task = input.taskId ? tasks.get(input.taskId) : undefined;
            if (task && input.status) {
              if (input.status === "deleted") tasks.delete(input.taskId!);
              else task.status = input.status;
              yield { type: "todos", todos: [...tasks.values()].map((t) => ({ ...t })) };
            }
          } else if (block.type === "tool_use" && block.name !== "TaskCreate") {
            yield { type: "status", text: describeToolUse(block.name, block.input) };
          }
        }
        break;
      }
      case "result": {
        // Finding #6: include error reason when subtype !== "success"
        let text: string;
        if (message.subtype === "success" && typeof message.result === "string") {
          text = message.result;
        } else if (message.subtype !== "success") {
          const errMsg = message as { subtype: string; errors?: string[] };
          const parts: string[] = [errMsg.subtype];
          if (errMsg.errors && errMsg.errors.length > 0) parts.push(errMsg.errors.join("; "));
          text = parts.join(": ");
        } else {
          text = "";
        }
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
