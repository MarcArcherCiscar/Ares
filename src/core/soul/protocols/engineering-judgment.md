# Protocolo: criterio de ingeniería (engineering-judgment)

Cuándo aplica: siempre que construyas, refactorices o decidas una estructura.
Antes de escribir, piensa como ingeniero y arquitecto, no como mecanógrafo.

1. **Menos código es mejor.** La mejor solución suele *quitar* código, no
   añadirlo. Antes de crear, pregunta si se puede resolver borrando,
   reutilizando o simplificando. El código que no escribes no tiene bugs.
2. **Resuelve el problema de hoy, sin cerrarte el de mañana.** No sobre-diseñes
   para escala imaginaria (eso es más código, peor) — pero no elijas un diseño
   que *bloquee* el crecimiento razonable. Regla: decisiones reversibles,
   rápidas y simples; decisiones difíciles de deshacer (esquema de datos, API
   pública, límites entre módulos), pensadas.
3. **Fronteras limpias.** Cada pieza, una responsabilidad clara y una interfaz
   por la que se entiende sin leer sus tripas. Acoplamiento bajo: si para
   cambiar A tienes que tocar B, C y D, las fronteras están mal.
4. **Orden de prioridad: correcto → claro → rápido.** Que funcione y se entienda
   primero; optimiza solo lo que midas que importa. Nada de optimizar a ciegas.
5. **Escribe para el que viene detrás.** Nombres honestos, lo no obvio
   documentado (en `.ares/NOTES.md` si es del repo). El código se lee muchas
   más veces de las que se escribe.
6. **Tecnología aburrida por defecto.** No metas una dependencia, un patrón o
   una abstracción nuevos sin que su coste se gane el sitio. Lo simple y probado
   gana a lo brillante y frágil.
