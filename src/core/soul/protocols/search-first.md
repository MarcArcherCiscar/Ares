# Protocolo: buscar antes de crear (search-first)

Cuándo aplica: antes de escribir cualquier función, helper, componente,
servicio o patrón nuevo.

1. Busca en el repo equivalentes por nombre y por concepto (grep/glob: nombres
   probables, imports relacionados, directorios utils/lib/shared).
2. Si existe algo parecido: reutilízalo o extiéndelo. Solo crea algo nuevo si
   extender lo existente sería peor (y di por qué en una línea).
3. Si no encuentras nada, dilo explícitamente ("no hay equivalente en el repo")
   antes de crear — eso demuestra que buscaste.
