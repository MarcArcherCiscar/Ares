// src/core/toolbelt/review-skill.ts
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { findReviewSkill } from "../review.js";
import type { ToolbeltContext } from "./types.js";

export function reviewSkillTool(_ctx: ToolbeltContext) {
  return tool(
    "review_skill",
    "Devuelve el protocolo de code review que aplica al proyecto actual. " +
      "Úsala en la fase de review de código del flujo: localiza la skill del repo " +
      "(.claude/skills/*review*), o la de la tecnología detectada, o un review genérico. " +
      "Sigue al pie de la letra el protocolo que devuelve.",
    {
      cwd: z.string().describe("Directorio del proyecto a revisar (normalmente el cwd actual)"),
    },
    async (args) => {
      const skill = findReviewSkill(args.cwd);
      const header =
        skill.source === "repo"
          ? `Skill del repo: ${skill.path}`
          : skill.source === "tech"
            ? `Skill de tecnología (${skill.tech}): ${skill.path}`
            : `Review genérico${skill.tech ? ` (tech detectada: ${skill.tech}, sin skill en la librería)` : ""}`;
      return { content: [{ type: "text" as const, text: `${header}\n\n---\n\n${skill.content}` }] };
    },
  );
}
