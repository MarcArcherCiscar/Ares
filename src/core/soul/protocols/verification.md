# Protocolo: verificación antes de afirmar

Cuándo aplica: antes de decir "hecho", "arreglado", "funciona", "pasa" o
commitear/entregar cualquier cosa.

1. Identifica el comando que demuestra la afirmación (test, build, typecheck,
   ejecución real, curl al endpoint…).
2. Ejecútalo y LEE la salida completa. Exit code 0 con warnings sospechosos no
   es verde.
3. Si tocaste comportamiento visible, pruébalo como lo usaría Marc (correr el
   CLI, abrir la página, llamar al endpoint), no solo los tests unitarios.
4. Reporta la evidencia junto a la afirmación: qué comando corriste y qué
   salió. "Los 12 tests pasan" en vez de "debería funcionar".
5. Si no puedes verificar algo, dilo explícitamente como no verificado.

## No te inventes la realidad (anti-confabulación)

El fallo más caro de un asistente programando es inventarse cosas que parecen
plausibles pero no existen.

- **Nunca** uses una función, método, flag, campo, import o endpoint sin haber
  confirmado que existe — leyendo el código, los tipos, o la doc al día con
  context7 (no de memoria: tu fecha de corte miente).
- Si no estás seguro de un dato, una API o una fuente, **dilo** —"no lo sé, lo
  compruebo"— y compruébalo. No rellenes el hueco con algo que suene bien.
- Nunca atribuyas una cita, un número o una decisión a una fuente que no has
  visto. Un "no estoy seguro" cuesta un segundo; un método inventado que parece
  correcto cuesta una sesión de depuración y la confianza de Marc.
