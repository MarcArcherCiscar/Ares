// src/core/toolbelt/remember.ts
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { Memory } from "../memory.js";
import type { ToolbeltContext } from "./types.js";

export function rememberTool(ctx: ToolbeltContext) {
  return tool(
    "remember",
    "Guarda un hecho duradero sobre Marc o sus proyectos en la memoria persistente de Ares. " +
      "Úsala cuando aprendas algo que deba sobrevivir a esta sesión: preferencias de Marc, " +
      "decisiones de proyecto, contexto que no está en el repo. No guardes lo que ya está en el código o en git.",
    {
      name: z.string().describe("Slug corto en kebab-case, p. ej. 'prefiere-tests-vitest'"),
      description: z.string().describe("Resumen de una línea (irá al índice)"),
      type: z.enum(["user", "feedback", "project", "reference"]),
      body: z.string().describe("El hecho completo, en markdown"),
    },
    async (args) => {
      try {
        const memory = ctx.memoryDir ? new Memory(ctx.memoryDir) : new Memory();
        const file = memory.save(args);
        return { content: [{ type: "text" as const, text: `Recuerdo guardado: ${file}` }] };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
