// src/cli/ui/app.tsx
import React, { useState, useRef } from "react";
import { render, Box, Text, useApp } from "ink";
import { TextInput, Spinner, ConfirmInput } from "@inkjs/ui";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { runAgent, type PermissionResult } from "../../core/agent.js";
import { loadUserConfig } from "../../core/config.js";
import { Memory } from "../../core/memory.js";

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

/** Cara de letra (█) en Ares Blue; bisel y sombra (╔╗╚╝═║) en Spark. */
function BannerLine({ line }: { line: string }) {
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
        <Text key={i} color={s.face ? COLORS.agent : COLORS.spark} bold>
          {s.text}
        </Text>
      ))}
    </Text>
  );
}

/** Pantalla de bienvenida: banner en caja + estado de la sesión. */
function Welcome({ model }: { model?: string }) {
  // Datos de sesión, leídos una vez al montar (son lecturas locales baratas).
  const [info] = useState(() => {
    const cfg = loadUserConfig();
    const recuerdos = new Memory().index().split("\n").filter((l) => l.trim().startsWith("- ")).length;
    return { model: model ?? cfg.models[0], recuerdos };
  });

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={COLORS.agent}
        paddingX={2}
        paddingY={0}
        alignSelf="flex-start"
      >
        <Box flexDirection="column" marginY={1}>
          {BANNER.map((line, i) => (
            <BannerLine key={i} line={line} />
          ))}
        </Box>
        <Text>
          <Text color={COLORS.spark} bold>⚔ </Text>
          <Text color={COLORS.user}>tu colega en la terminal</Text>
          <Text color={COLORS.meta}> · {VERSION}</Text>
        </Text>
        <Box marginBottom={1}>
          <Text>
            <Text color={COLORS.meta}>▸ </Text>
            <Text color={COLORS.sky}>{basename(process.cwd())}</Text>
            <Text color={COLORS.meta}>   ▸ </Text>
            <Text color={COLORS.sky}>{info.model}</Text>
            <Text color={COLORS.meta}>   ▸ </Text>
            <Text color={COLORS.sky}>
              {info.recuerdos} {info.recuerdos === 1 ? "recuerdo" : "recuerdos"}
            </Text>
          </Text>
        </Box>
      </Box>
      <Text color={COLORS.meta}>  escribe tu encargo y Enter · /salir para terminar</Text>
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

function App({ model }: { model?: string }) {
  const { exit } = useApp();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [streamText, setStreamText] = useState("");
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

    const outputDir = mkdtempSync(join(tmpdir(), "ares-run-"));
    let finalText = "";
    let streamed = ""; // acumulador local: el state `streamText` queda obsoleto en este closure
    try {
      for await (const event of runAgent({
        prompt: trimmed,
        cwd: process.cwd(),
        model,
        outputDir,
        resumeSessionId: sessionId.current,
        permissionMode: "acceptEdits",
        canUseTool: (toolName, input) =>
          new Promise<PermissionResult>((resolve) => {
            const detail =
              toolName === "Bash" && typeof input.command === "string"
                ? input.command
                : JSON.stringify(input).slice(0, 120);
            setPendingQueue((q) => [...q, { toolName, detail, resolve }]);
          }),
        channelInstructions:
          "Estás en la terminal de Marc, en una sesión interactiva. Markdown ligero.",
      })) {
        if (event.type === "status") setStatus(event.text);
        else if (event.type === "delta") {
          streamed += event.text;
          setStreamText(streamed);
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
    setRunning(false);
    setPendingQueue([]);
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Welcome model={model} />

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
            <Text color={COLORS.meta}>(Y/n)</Text>
          </Text>
          <ConfirmInput
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

export async function runInteractive(opts: { model?: string }): Promise<void> {
  const { waitUntilExit } = render(<App model={opts.model} />);
  await waitUntilExit();
}
