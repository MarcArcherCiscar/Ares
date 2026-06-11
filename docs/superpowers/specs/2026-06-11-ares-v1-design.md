# Ares v1 — Diseño

**Fecha:** 2026-06-11
**Estado:** Aprobado por Marc
**Repo:** git@github.com:MarcArcherCiscar/Ares.git (evolución del código existente, no reescritura)

## Visión

Ares es el asistente personal de Marc: un agente de programación con identidad propia
("padawan" formado por Claude), memoria persistente de Marc y sus proyectos, y
extensible para conectarse a su mundo (FarmaVazquez, sports-bot, polyarb…).

Vive en dos canales con el mismo cerebro, la misma alma y la misma memoria:

- **Terminal** (`ares` en cualquier repo) — el canal nuevo de esta v1.
- **Telegram** — el puente que ya existe en este repo, que se refactoriza para
  usar el núcleo compartido.

No compite con Claude Code ni con OpenClaw: es el proyecto personal de Marc,
dev-first, pequeño y auditable, cableado a su vida.

## Decisiones cerradas

| Tema | Decisión |
|---|---|
| Lenguaje | TypeScript (Node ≥ 20) |
| Motor | `@anthropic-ai/claude-agent-sdk` (actualizar de `^0.1.0` a `0.3.x`) |
| Modelo | Cadena de preferencia en config: `["claude-fable-5", "claude-opus-4-8"]`. Fable mientras esté incluido en la suscripción (sale de los planes el 23-06-2026); caída automática a Opus si no está disponible. Nunca hardcodeado. |
| Auth | Token OAuth de la suscripción Max (`claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN`). `ANTHROPIC_API_KEY` como fallback. **Verificar en fase de plan** el comportamiento exacto del SDK 0.3.x con auth de suscripción. |
| Personalidad | "Colega competente con chispa": cercano, directo, con descaro, en español. |
| Razonamiento | Extended thinking activado con presupuesto alto por defecto. |
| Estrategia de repo | Evolucionar el repo Ares existente hacia estructura `core/` + `cli/` + `telegram/`. |

## Arquitectura

```
ares/
├── core/                  ← NUEVO — lo que hace a Ares ser Ares
│   ├── soul/
│   │   ├── soul.md        ← identidad + doctrina (escrito por Claude)
│   │   └── protocols/     ← procedimientos: debugging, verificación, búsqueda
│   ├── memory/            ← memoria persistente de Marc (~/.ares/memory/)
│   ├── toolbelt/          ← mecanismo de tools custom (1 archivo = 1 tool)
│   ├── agent.ts           ← wrapper del Agent SDK: compone soul + memoria +
│   │                         toolbelt + config en una sesión
│   └── config.ts          ← ~/.ares/config.json (modelos, permisos)
├── cli/                   ← NUEVO — la v1
│   ├── ui/                ← Ink: banner, streaming, actividad de tools, input
│   ├── repl.ts            ← sesión interactiva
│   └── headless.ts        ← `ares -p "<prompt>"` (sin UI, para scripts/cron/puentes)
└── telegram/              ← EXISTENTE — refactor para consumir core/
    (telegram.ts, projects.ts, scheduler.ts, store.ts, format.ts, tools/screenshot.ts)
```

Fronteras: `core/` no sabe nada de canales; `cli/` y `telegram/` no hablan con el
SDK directamente, solo con `core/agent.ts`. Cambiar modelo, UI o alma no toca las
otras capas.

### core/agent.ts (núcleo)

Única puerta al Agent SDK. Responsabilidades:

- Componer el system prompt: `soul.md` + índice de memoria + contexto del proyecto.
- Configurar la sesión: cadena de modelos (primer disponible), thinking alto,
  tools del SDK (Read/Write/Edit/Bash/Glob/Grep/WebSearch/WebFetch) + toolbelt.
- Exponer un stream de eventos tipado (texto, thinking, tool_use, resultado,
  error) que cualquier canal puede renderizar.
- Permisos: edits libres dentro del workspace; Bash con confirmación vía callback
  que cada canal implementa a su manera (CLI: prompt interactivo; Telegram:
  inline keyboard — ya estaba en su roadmap). Configurable en config.json.

### El alma (soul/)

- **`soul.md`** — dos partes:
  1. *Identidad*: quién es Ares, cómo habla (colega directo con chispa, español),
     su relación con Marc.
  2. *Doctrina*: principios operativos heredados de Claude — buscar antes de
     crear, verificar antes de afirmar, resultado primero al comunicar,
     reproducir antes de teorizar.
- **`protocols/`** — procedimientos detallados que el alma referencia y Ares
  aplica cuando tocan: `debugging.md` (reproducir → hipótesis → test → fix →
  verificar), `verification.md` (prohibido decir "arreglado" sin ejecutar la
  prueba), `search-first.md`.
- El loop de verificación no es opcional: la doctrina exige que tras cada cambio
  Ares ejecute la verificación correspondiente antes de reportar éxito.

### Memoria (core/memory/)

Mismo patrón que la memoria de Claude Code:

- `~/.ares/memory/*.md` — un archivo por hecho, con frontmatter
  (name, description, type: user|feedback|project|reference).
- `~/.ares/memory/MEMORY.md` — índice de una línea por recuerdo; se inyecta al
  arrancar cualquier sesión (terminal o Telegram).
- Tool custom **`remember`** en el toolbelt: Ares guarda hechos nuevos durante la
  sesión (escribe el archivo + actualiza el índice).
- Cross-proyecto y cross-canal: la memoria es de Marc, no de la sesión.

### Toolbelt (core/toolbelt/)

- Una tool = un archivo TS que exporta `{ name, description, inputSchema, run }`.
- Registro automático: los archivos del directorio se cargan y se exponen al
  agente vía el mecanismo de tools custom del SDK (MCP in-process / `tool()`).
- v1 incluye: `remember` (memoria) + un ejemplo dummy documentado como plantilla.
- La tool `screenshot` existente de telegram/ se migra al toolbelt.
- Integraciones reales (FarmaVazquez, sports-bot EC2, polyarb DB…) quedan fuera
  de v1; se añaden después como archivos sueltos (o se las pide Marc a Ares).

### CLI (cli/)

- **Interactivo** (`ares`): banner de arranque, saludo personalizado (usa la
  memoria), REPL con streaming en vivo, indicador de fase (pensando / usando
  tool X / escribiendo), colores. Construido con Ink.
- **Headless** (`ares -p "<prompt>"`): ejecuta un encargo y escribe el resultado
  a stdout, sin UI. Es la pieza que habilita cron, scripts, hooks de git y el
  puente Telegram. Exit code ≠ 0 si la tarea falla.
- Instalación global: `npm link` / `npm i -g` → comando `ares` disponible en
  cualquier directorio; el workspace es el cwd.

### Telegram (telegram/) — refactor, no reescritura

Lo existente (puente grammY, allowlist por user ID, sesiones por proyecto,
descubrimiento de proyectos, `/model`, cron con croner, render HTML) se conserva.
Cambio único de la v1: `agent.ts` propio desaparece y el canal consume
`core/agent.ts`, con lo que hereda alma, memoria, toolbelt y cadena de modelos.

El flujo remoto completo queda: **Beszel** (ya configurado por Marc) alerta por
Telegram → Marc pide a Ares que actúe → mismo Ares, desde el móvil.

## Manejo de errores

- Modelo preferido no disponible (p. ej. Fable fuera del plan) → caer al
  siguiente de la cadena, avisando una vez por sesión.
- Error de API / rate limit → retry con backoff; si persiste, Ares lo comunica
  en personaje y conserva el estado de la sesión.
- Tool del toolbelt que lanza excepción → se reporta al modelo como resultado de
  error, nunca tumba la sesión.
- Límite de uso de la suscripción alcanzado → mensaje claro con la causa
  (la bolsa es compartida con el uso normal de Claude Code de Marc).

## Testing

- **Vitest** para las unidades puras: memoria (escritura/lectura/índice), config
  (parsing, cadena de modelos), registro del toolbelt, composición del system
  prompt.
- **Smoke test** del loop completo (`ares -p` con una tarea trivial) usando
  Haiku para que sea barato; ejecución manual, no en CI.
- El refactor de telegram/ se valida con `npm run typecheck` + prueba manual del
  bot.

## Fuera de alcance (v1)

- Integraciones reales del toolbelt (FarmaVazquez, sports-bot, polyarb…).
- Briefing matutino / tareas programadas nuevas (el cron de Telegram existente
  se conserva tal cual).
- Best-of-N con juez ("modo guerra").
- Voz, daemon, web UI propia (Beszel + Telegram cubren la visibilidad remota).
- AresBench (evaluación Ares vs modelos a pelo) — idea para v1.1+.

## Orden de construcción sugerido

1. **core/**: config + cadena de modelos + wrapper del SDK (actualizado a 0.3.x)
   + soul + memoria + toolbelt.
2. **cli/**: headless `-p` primero (valida el core sin UI), después la UI Ink.
3. **telegram/**: refactor sobre core/.
