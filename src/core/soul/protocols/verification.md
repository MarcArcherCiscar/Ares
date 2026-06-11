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
