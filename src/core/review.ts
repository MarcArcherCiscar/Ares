// src/core/review.ts
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export type ReviewSource = "repo" | "tech" | "generic";

export interface ReviewSkill {
  source: ReviewSource;
  /** Ruta al SKILL.md usado, o null si es el genérico incorporado. */
  path: string | null;
  /** Tecnología detectada, si la hubo. */
  tech?: string;
  /** Contenido del protocolo de review a seguir. */
  content: string;
}

/** Marcadores de tecnología → nombre canónico. Primer match gana (orden estable). */
const TECH_MARKERS: Array<[file: string, tech: string]> = [
  ["Cargo.toml", "rust"],
  ["go.mod", "go"],
  ["pyproject.toml", "python"],
  ["requirements.txt", "python"],
  ["project.godot", "godot"],
  ["package.json", "typescript"],
];

const GENERIC_REVIEW = `# Code review genérico (sin skill específica del repo)

Lanza 3 agentes en paralelo (tool Task) sobre el diff, cada uno con un foco, y
consolida. NO arreglar en el agente: solo reportar con archivo:línea.

1. **Reuse** — ¿se reinventa algo que ya existe en el repo? ¿duplicación entre
   archivos nuevos? ¿constantes/strings mágicos que deberían centralizarse?
2. **Quality** — bugs reales, nombres engañosos, código muerto, manejo de
   errores flojo, comentarios que narran el "qué" en vez del "porqué".
3. **Efficiency** — trabajo redundante, llamadas que se podrían paralelizar,
   estructuras de datos o queries ineficientes en caminos calientes.

Consolida en P0 (bug o duplicación grave, fácil) / P1 (vale la pena) / P2
(estilo) / descartados. Aplica P0→P1→P2 y verifica (tests/build) tras cada
grupo.`;

/** Localiza el protocolo de code review para un repo: repo > tecnología > genérico. */
export function findReviewSkill(
  cwd: string,
  skillsHome: string = join(homedir(), ".ares", "skills"),
): ReviewSkill {
  // 1. Repo gana: .claude/skills/*review*/SKILL.md
  const localSkills = join(cwd, ".claude", "skills");
  if (existsSync(localSkills)) {
    for (const entry of readdirSync(localSkills)) {
      if (!entry.toLowerCase().includes("review")) continue;
      const skillMd = join(localSkills, entry, "SKILL.md");
      if (existsSync(skillMd) && statSync(skillMd).isFile()) {
        return { source: "repo", path: skillMd, content: readFileSync(skillMd, "utf8") };
      }
    }
  }

  // 2. Detección de tecnología → librería central
  let tech: string | undefined;
  for (const [marker, name] of TECH_MARKERS) {
    if (existsSync(join(cwd, marker))) {
      tech = name;
      break;
    }
  }
  if (tech) {
    const techMd = join(skillsHome, `review-${tech}`, "SKILL.md");
    if (existsSync(techMd)) {
      return { source: "tech", path: techMd, tech, content: readFileSync(techMd, "utf8") };
    }
  }

  // 3. Genérico incorporado (informando la tech si se detectó)
  return { source: "generic", path: null, tech, content: GENERIC_REVIEW };
}
