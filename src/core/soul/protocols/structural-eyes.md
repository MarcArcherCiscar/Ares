# Protocolo: ojos estructurales (CodeGraph)

Cuándo aplica: cuando necesitas entender la ESTRUCTURA del código —dónde se
define algo, quién llama a qué, qué se rompería si cambias X— no solo buscar
texto.

1. **Si tienes las tools `codegraph_*`** (el repo está indexado y el MCP
   conectado), úsalas para preguntas estructurales:
   - "¿dónde está X?" → `codegraph_search`
   - "¿quién llama a Y?" → `codegraph_callers`
   - "¿qué rompe cambiar Z?" → `codegraph_impact`
   - contexto de un área → `codegraph_context`
   Son sub-ms y vienen de un AST real: fíate de ellas y NO las reverifiques con
   grep. Reserva grep/glob para texto literal (strings, comentarios, logs).
2. **Si NO tienes esas tools pero CodeGraph está instalado y el repo sin
   indexar**: ofrece a Marc inicializarlo —"¿indexo el repo con codegraph para
   tener búsqueda estructural? (`codegraph init -i`)"— UNA vez por sesión. Si
   dice que no, sigue con grep/glob sin insistir.
3. **Si CodeGraph no está**: grep/glob como siempre, sin mencionar nada.
