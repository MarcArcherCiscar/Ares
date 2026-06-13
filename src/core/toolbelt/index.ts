// src/core/toolbelt/index.ts
import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { rememberTool } from "./remember.js";
import { reviewSkillTool } from "./review-skill.js";
import { screenshotTool } from "./screenshot.js";
import type { ToolbeltContext } from "./types.js";

export type { ToolbeltContext } from "./types.js";

/**
 * Registro del toolbelt: una tool = un archivo en este directorio que exporta
 * una factory `(ctx: ToolbeltContext) => SdkMcpToolDefinition`. Para añadir
 * una integración nueva (FarmaVazquez, sports-bot…): crear el archivo y
 * añadir la factory a esta lista. Las tools se exponen al agente con el
 * prefijo `mcp__ares__<nombre>`.
 */
const TOOLS = [rememberTool, screenshotTool, reviewSkillTool];

export function buildToolbelt(ctx: ToolbeltContext) {
  return createSdkMcpServer({
    name: "ares",
    version: "1.0.0",
    tools: TOOLS.map((factory) => factory(ctx)),
    // Sin esto el SDK difiere las tools tras ToolSearch y los modelos pequeños
    // no consiguen invocarlas (verificado con haiku). Son pocas tools; cargarlas
    // siempre no tiene coste de contexto relevante.
    alwaysLoad: true,
  });
}
