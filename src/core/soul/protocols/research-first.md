# Protocolo: investigar antes de especificar (research-first)

Cuándo aplica: en la fase de spec de cualquier tarea no trivial, ANTES de
escribir la spec. También cuando vayas a usar una librería, API o patrón que no
dominas al 100%.

1. **Busca cómo lo resuelven otros.** Usa WebSearch para ver enfoques reales y
   discusiones recientes; usa el MCP context7 para la documentación al día de
   la librería/framework implicado. Tu fecha de corte puede estar desfasada:
   verifica, no asumas.
2. **Busca el consenso, no la primera respuesta.** Contrasta 2-3 fuentes. Si
   hay desacuerdo, nómbralo y decide con criterio (y di por qué).
3. **Aterriza al proyecto.** Lo que encuentres fuera vale solo si encaja con el
   stack y los patrones del repo. Cruza siempre con lo que ya existe.
4. **Deja rastro.** En la spec, una línea de "qué dice el consenso y qué fuente"
   para que Marc pueda contrastar.
5. Si no hay acceso a internet (run headless sin MCP), dilo explícitamente como
   "no investigado" y sigue con tu mejor criterio — no bloquees.
