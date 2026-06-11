// src/cli/ui/app.tsx
import React, { useState, useRef } from "react";
import { render, Box, Text, useApp } from "ink";
import { TextInput, Spinner, ConfirmInput } from "@inkjs/ui";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { runAgent, type PermissionResult } from "../../core/agent.js";

const BANNER = [
  "  ▄▀█ █▀█ █▀▀ █▀",
  "  █▀█ █▀▄ ██▄ ▄█",
];

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
  const [pending, setPending] = useState<PendingPermission | null>(null);
  const sessionId = useRef<string | undefined>(undefined);

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
            setPending({ toolName, detail, resolve });
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
    setPending(null);
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="column" marginBottom={1}>
        {BANNER.map((line) => (
          <Text key={line} color="redBright" bold>
            {line}
          </Text>
        ))}
        <Text dimColor>
          {"  "}a tu servicio en {basename(process.cwd())} · /salir para terminar
        </Text>
      </Box>

      {turns.map((t, i) => (
        <Box key={i} marginBottom={1}>
          <Text color={t.role === "user" ? "cyan" : "redBright"} bold>
            {t.role === "user" ? "tú ▸ " : "ares ▸ "}
          </Text>
          <Text>{t.text}</Text>
        </Box>
      ))}

      {running && streamText && (
        <Box marginBottom={1}>
          <Text color="redBright" bold>
            {"ares ▸ "}
          </Text>
          <Text>{streamText}</Text>
        </Box>
      )}

      {pending ? (
        <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
          <Text color="yellow">
            ⚔️ Ares quiere usar {pending.toolName}: <Text bold>{pending.detail}</Text>{" "}
            <Text dimColor>(Y/n)</Text>
          </Text>
          <ConfirmInput
            onConfirm={() => {
              pending.resolve({ behavior: "allow" });
              setPending(null);
            }}
            onCancel={() => {
              pending.resolve({ behavior: "deny", message: "Marc lo ha denegado." });
              setPending(null);
            }}
          />
        </Box>
      ) : running ? (
        <Box>
          <Spinner label={` ${status || "trabajando…"}`} />
        </Box>
      ) : (
        <Box>
          <Text color="cyan" bold>
            {"tú ▸ "}
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
