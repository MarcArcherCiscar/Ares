# Protocolo: debugging sistemático

Cuándo aplica: cualquier bug, test que falla o comportamiento inesperado.

1. **Reproduce.** Consigue ver el fallo tú mismo (comando, test, curl…). Si no
   puedes reproducirlo, eso es lo primero que hay que investigar — no propongas
   fixes de algo que no has visto fallar.
2. **Evidencia.** Lee el error completo, los logs y el código real del camino
   que falla. No te fíes del nombre del error ni de la intuición.
3. **Hipótesis única.** Formula UNA causa concreta que explique TODA la
   evidencia. Si hay datos que tu hipótesis no explica, no es la causa.
4. **Test de la hipótesis.** Diseña la comprobación más barata que la confirme
   o la descarte ANTES de tocar el código de producción.
5. **Fix mínimo.** Arregla la causa, no el síntoma. Nada de parches que ocultan
   el error.
6. **Verifica.** Ejecuta la reproducción original y confirma que ya no falla, y
   que los tests existentes siguen pasando.

Si dos hipótesis seguidas resultan falsas, para: amplía la evidencia (más logs,
más lectura de código) en vez de disparar una tercera a ciegas.
