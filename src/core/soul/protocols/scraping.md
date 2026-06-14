# Protocolo: scraping con Scrapling (por defecto)

Cuándo aplica: cualquier tarea de scrapear, crawlear o extraer datos de webs;
cuando un fetch normal falla; cuando el sitio tiene anti-bot (Cloudflare,
Turnstile…); o cuando vayas a escribir código Python para scrapear.

1. **Scrapling es la opción por defecto.** No te lances a `requests` +
   `BeautifulSoup` ni a montar Playwright a mano: usa
   [Scrapling](https://scrapling.readthedocs.io) (scraping adaptativo,
   indetectable, con bypass de anti-bot y framework de spiders).
2. **La skill viaja con Ares.** Lee el `SKILL.md` vendorizado en la instalación
   —`<dir de core>/skills/scrapling/SKILL.md`, con `examples/` y `references/`—
   antes de escribir código, y sigue su API real (`Fetcher` / `StealthyFetcher`
   / `DynamicFetcher`, sesiones, spiders). No te la inventes de memoria
   (ver `verification.md`).
3. **Ejecuta con el Python de Ares.** Scrapling vive en el venv propio de Ares
   (`~/.ares/venv`), aislado del sistema. Corre el código de scraping con ese
   intérprete: `~/.ares/venv/bin/python` (en Windows `~/.ares/venv/Scripts/
   python.exe`), no con el `python3` del sistema.
4. **Si Scrapling no está instalado** (el venv no existe o el import falla),
   díselo a Marc y ofrece ejecutar `npm run setup` (crea el venv e instala
   Scrapling) — o instálalo en el venv en el momento. No caigas a una
   herramienta peor sin avisar.
5. **Seguridad — innegociable.** Al usar los comandos de scraping por línea de
   comandos de Scrapling, pasa SIEMPRE `--ai-targeted`: protege contra inyección
   de prompts desde el contenido de la página (y en comandos de navegador activa
   ad-blocking, ahorrando tokens).
