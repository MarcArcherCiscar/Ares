# Protocolo: flujo disciplinado (workflow)

Cuándo aplica: tareas NO triviales — una feature, un cambio que tocará varios
archivos, un dominio nuevo, un refactor de calado. Para un fix de una línea, una
pregunta o un cambio trivial: ve directo, sin flujo. El proceso se gana su
sitio; no lo impongas en lo pequeño.

Cuando aplica, sigue estas fases y NO avances de una a la siguiente hasta pasar
su review:

## 1. Investigación + Spec
- Investiga primero (sigue `research-first.md`).
- Escribe una spec corta: qué se construye, alcance, criterios de éxito.
- **Review de spec**: ¿está completa? ¿hay ambigüedades? ¿se contradice? ¿el
  alcance es el correcto (ni de más ni de menos)? Corrige antes de seguir.

## 2. Plan
- Descompón en pasos atómicos y verificables (cada uno con cómo se comprueba).
- **Review de plan**: ¿cubre toda la spec? ¿cada paso tiene su verificación?
  ¿algún paso esconde tres? Corrige antes de seguir.

## 3. Implementación
- Tarea por tarea, con subagentes (tool Task) cuando aporte aislamiento.
- Aplica los protocolos de siempre: `step-by-step.md` (lista de tareas) y
  `verification.md` (verifica antes de afirmar).
- **Review de código**: llama a la tool `mcp__ares__review_skill` con el cwd
  del proyecto y SIGUE el protocolo que te devuelva (será la skill del repo si
  existe, la de la tecnología, o un review genérico). Aplica sus fixes.

## 4. Resumen
- Resume qué se hizo, con la evidencia (qué se verificó y cómo).
- **Review de fidelidad**: ¿el resumen dice la verdad? ¿hay algún test que se
  saltó, algo a medias sin declarar, alguna afirmación sin verificar? Si lo hay,
  dilo claro — nunca maquilles el resultado.

Cada review que encuentra problemas vuelve a su fase antes de avanzar.
