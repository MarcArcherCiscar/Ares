// src/cli/ui/app.tsx
import React, { useState, useRef } from "react";
import { render, Box, Text, useApp } from "ink";
import { TextInput, Spinner, ConfirmInput } from "@inkjs/ui";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { runAgent, type PermissionResult, type TodoItem } from "../../core/agent.js";
import { loadUserConfig } from "../../core/config.js";
import { Memory } from "../../core/memory.js";
import { HELMET } from "./helmet.js";

const VERSION = "v1.0";

/** Paleta Ares (identidad 2026-06): https://github.com/MarcArcherCiscar/Ares */
const COLORS = {
  agent: "#2F6BFF", // Ares Blue — voz del agente, marca
  spark: "#34E0FF", // Spark — bisel del banner, acentos, celebración
  user: "#E6ECF5", // Foreground — texto del usuario
  sky: "#8FB3FF", // Sky — glyph del prompt, pensando/trabajando
  meta: "#8B98B0", // Steel — subtítulos, ayudas, atenuado
  warn: "#FFC53D", // Gold — permisos y avisos
  error: "#FF5C5C", // Ember — solo errores
} as const;

const BANNER = [
  " █████╗ ██████╗ ███████╗███████╗",
  "██╔══██╗██╔══██╗██╔════╝██╔════╝",
  "███████║██████╔╝█████╗  ███████╗",
  "██╔══██║██╔══██╗██╔══╝  ╚════██║",
  "██║  ██║██║  ██║███████╗███████║",
  "╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝",
];

/** Interpola el degradado Aegis (Ares Blue → Spark) para la línea t ∈ [0,1]. */
function aegis(t: number): string {
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
  const [r, g, b] = [lerp(0x2f, 0x34), lerp(0x6b, 0xe0), 0xff];
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Cara de letra (█) en degradado Aegis; bisel y sombra (╔╗╚╝═║) en Ares Deep. */
function BannerLine({ line, t }: { line: string; t: number }) {
  const segments: { text: string; face: boolean }[] = [];
  for (const ch of line) {
    const face = ch === "█";
    const last = segments[segments.length - 1];
    if (last && last.face === face) last.text += ch;
    else segments.push({ text: ch, face });
  }
  return (
    <Text>
      {segments.map((s, i) => (
        <Text key={i} color={s.face ? aegis(t) : "#1E4FD6"} bold>
          {s.text}
        </Text>
      ))}
    </Text>
  );
}

/** Pantalla de bienvenida: banner en caja + estado de la sesión. */
function Welcome({ model: modelOverride, safe }: { model?: string; safe?: boolean }) {
  // Datos de sesión, leídos una vez al montar (son lecturas locales baratas).
  const [info] = useState(() => {
    const cfg = loadUserConfig();
    const recuerdos = new Memory().index().split("\n").filter((l) => l.trim().startsWith("- ")).length;
    // Nombre corto para la fila de info: "claude-fable-5" → "fable-5".
    const model = (modelOverride ?? cfg.models[0]).replace(/^claude-/, "");
    return { model, recuerdos };
  });

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box
        borderStyle="round"
        borderColor={COLORS.agent}
        paddingX={2}
        paddingY={0}
        alignSelf="flex-start"
      >
        <Box flexDirection="column" marginY={1} marginRight={2}>
          {HELMET.map((line, i) => (
            <Text key={i}>{line}</Text>
          ))}
        </Box>
        <Box flexDirection="column" justifyContent="center">
          {BANNER.map((line, i) => (
            <BannerLine key={i} line={line} t={i / (BANNER.length - 1)} />
          ))}
          <Text> </Text>
          <Text>
            <Text color={COLORS.spark} bold>⚔ </Text>
            <Text color={COLORS.user}>tu colega en la terminal</Text>
            <Text color={COLORS.meta}> · {VERSION}</Text>
          </Text>
          <Text>
            <Text color={COLORS.meta}>▸ </Text>
            <Text color={COLORS.sky}>{basename(process.cwd())}</Text>
            <Text color={COLORS.meta}> · </Text>
            <Text color={COLORS.sky}>{info.model}</Text>
            <Text color={COLORS.meta}> · </Text>
            <Text color={COLORS.sky}>
              {info.recuerdos} {info.recuerdos === 1 ? "recuerdo" : "recuerdos"}
            </Text>
            <Text color={COLORS.meta}> · </Text>
            {safe ? (
              <Text color={COLORS.sky}>modo seguro</Text>
            ) : (
              <Text color={COLORS.warn}>sin permisos ⚡</Text>
            )}
          </Text>
        </Box>
      </Box>
      <Text color={COLORS.meta}>
        {"  escribe tu encargo y Enter · /salir para terminar"}
        {safe ? "" : " · --safe para confirmar comandos"}
      </Text>
    </Box>
  );
}

interface Turn {
  role: "user" | "ares";
  text: string;
}

interface PendingPermission {
  toolName: string;
  detail: string;
  resolve: (r: PermissionResult) => void;
}

function App({ model, safe }: { model?: string; safe?: boolean }) {
  const { exit } = useApp();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [streamText, setStreamText] = useState("");
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [thinking, setThinking] = useState("");
  // Cola: el modelo puede pedir varias tools en paralelo; cada petición espera
  // su turno en vez de machacar a la anterior (cuya promesa nunca resolvería).
  const [pendingQueue, setPendingQueue] = useState<PendingPermission[]>([]);
  const pending = pendingQueue[0] ?? null;
  const sessionId = useRef<string | undefined>(undefined);

  function resolvePending(r: PermissionResult) {
    pending?.resolve(r);
    setPendingQueue((q) => q.slice(1));
  }

  async function submit(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed || running) return;
    if (trimmed === "/salir" || trimmed === "/exit") {
      exit();
      return;
    }
    setTurns((t) => [...t, { role: "user", text: trimmed }]);
    setRunning(true);
    setStatus("pensando…");
    setStreamText("");
    setTodos([]);
    setThinking("");

    const outputDir = mkdtempSync(join(tmpdir(), "ares-run-"));
    let finalText = "";
    let streamed = ""; // acumulador local: el state `streamText` queda obsoleto en este closure
    let thought = ""; // ídem para el razonamiento
    try {
      for await (const event of runAgent({
        prompt: trimmed,
        cwd: process.cwd(),
        model,
        outputDir,
        resumeSessionId: sessionId.current,
        // Por defecto sin confirmaciones (bypass); con --safe se piden.
        // Ojo: 'acceptEdits' NO dispara canUseTool ni para Bash — hay que usar
        // 'default' para que la confirmación sea real (verificado en 0.3.x).
        permissionMode: safe ? "default" : "bypassPermissions",
        ...(safe
          ? {
              canUseTool: (toolName: string, input: Record<string, unknown>) =>
                new Promise<PermissionResult>((resolve) => {
                  const detail =
                    toolName === "Bash" && typeof input.command === "string"
                      ? input.command
                      : JSON.stringify(input).slice(0, 120);
                  setPendingQueue((q) => [...q, { toolName, detail, resolve }]);
                }),
            }
          : {}),
        channelInstructions:
          "Estás en la terminal de Marc, en una sesión interactiva. Markdown ligero.",
      })) {
        if (event.type === "status") setStatus(event.text);
        else if (event.type === "delta") {
          streamed += event.text;
          setStreamText(streamed);
          if (thought) {
            thought = ""; // llegó la respuesta: el razonamiento se recoge
            setThinking("");
          }
        } else if (event.type === "thinking") {
          thought += event.text;
          setThinking(thought);
        } else if (event.type === "todos") {
          setTodos(event.todos);
        } else if (event.type === "result") {
          sessionId.current = event.sessionId ?? sessionId.current;
          finalText = event.text;
          if (event.isError) finalText = `❌ ${event.text || "La sesión terminó con error."}`;
        }
      }
    } catch (err) {
      finalText = `❌ ${(err as Error).message}`;
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
    setTurns((t) => [...t, { role: "ares", text: finalText || streamed || "(sin respuesta)" }]);
    setStreamText("");
    setStatus("");
    setThinking("");
    setTodos([]);
    setRunning(false);
    setPendingQueue([]);
  }

  // Últimas 3 líneas del razonamiento, para el bloque atenuado.
  const thinkingTail = thinking
    ? thinking.split("\n").filter((l) => l.trim()).slice(-3)
    : [];

  return (
    <Box flexDirection="column" paddingX={1}>
      <Welcome model={model} safe={safe} />

      {turns.map((t, i) => (
        <Box key={i} marginBottom={1}>
          <Text color={t.role === "user" ? COLORS.sky : COLORS.agent} bold>
            {t.role === "user" ? "› " : "ares ▸ "}
          </Text>
          <Text color={t.role === "user" ? COLORS.user : t.text.startsWith("❌") ? COLORS.error : undefined}>
            {t.text}
          </Text>
        </Box>
      ))}

      {running && todos.length > 0 && (
        <Box flexDirection="column" marginBottom={1} paddingLeft={1}>
          {todos.map((todo, i) => (
            <Text key={i}>
              <Text
                color={
                  todo.status === "completed" ? "#38E08A" : todo.status === "in_progress" ? COLORS.sky : COLORS.meta
                }
              >
                {todo.status === "completed" ? "☑ " : todo.status === "in_progress" ? "▸ " : "○ "}
              </Text>
              <Text
                color={todo.status === "in_progress" ? COLORS.user : COLORS.meta}
                strikethrough={todo.status === "completed"}
              >
                {todo.content}
              </Text>
            </Text>
          ))}
        </Box>
      )}

      {running && !streamText && thinkingTail.length > 0 && (
        <Box flexDirection="column" marginBottom={1} paddingLeft={1}>
          {thinkingTail.map((line, i) => (
            <Text key={i} color={COLORS.sky} dimColor italic>
              {line}
            </Text>
          ))}
        </Box>
      )}

      {running && streamText && (
        <Box marginBottom={1}>
          <Text color={COLORS.agent} bold>
            {"ares ▸ "}
          </Text>
          <Text>{streamText}</Text>
        </Box>
      )}

      {pending ? (
        <Box flexDirection="column" borderStyle="round" borderColor={COLORS.warn} paddingX={1}>
          <Text color={COLORS.warn}>
            ⚠ Ares quiere usar {pending.toolName}: <Text bold>{pending.detail}</Text>{" "}
            <Text color={COLORS.meta}>(y/N)</Text>
          </Text>
          {/* En modo seguro, Enter a secas deniega: por defecto se protege. */}
          <ConfirmInput
            defaultChoice="cancel"
            onConfirm={() => resolvePending({ behavior: "allow" })}
            onCancel={() => resolvePending({ behavior: "deny", message: "Marc lo ha denegado." })}
          />
        </Box>
      ) : running ? (
        <Box>
          {/* Spinner renderiza un <Box> interno: no puede ir dentro de <Text>. */}
          <Spinner />
          <Text color={COLORS.sky}> {status || "trabajando…"}</Text>
        </Box>
      ) : (
        <Box>
          <Text color={COLORS.sky} bold>
            {"› "}
          </Text>
          {/* @inkjs/ui TextInput es no-controlado (sin prop `value`): el key fuerza un
              remount tras cada turno para que el campo empiece vacío. */}
          <TextInput key={turns.length} onSubmit={submit} placeholder="¿Qué hacemos?" />
        </Box>
      )}
    </Box>
  );
}

export async function runInteractive(opts: { model?: string; safe?: boolean }): Promise<void> {
  const { waitUntilExit } = render(<App model={opts.model} safe={opts.safe} />);
  await waitUntilExit();
}
