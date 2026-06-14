# Protocolo: buscar antes de crear (search-first)

Cuándo aplica: antes de escribir cualquier función, helper, componente,
servicio o patrón nuevo.

El mejor código es el que no escribes. Antes de teclear, baja por esta
compuerta en orden y quédate en el primer escalón que resuelva el problema:

1. **¿Ya existe en el repo?** Busca equivalentes por nombre y por concepto
   (grep/glob: nombres probables, imports relacionados, `utils/lib/shared`). Si
   hay algo parecido, reutilízalo o extiéndelo.
2. **¿Lo hace la plataforma/lenguaje de serie?** Antes de una librería o un
   helper propio, mira si el runtime, el estándar o el framework ya lo traen
   (métodos nativos, APIs del SDK, utilidades del framework).
3. **¿Lo cubre una dependencia ya instalada?** Si ya está en `package.json` /
   `Cargo.toml` / etc., úsala antes de añadir otra o reinventarla. No metas una
   dependencia nueva sin que su coste se gane el sitio.
4. **¿Basta una implementación mínima?** Si hay que escribir código, escribe lo
   mínimo que resuelva el caso real de hoy — no el framework genérico para casos
   que nadie ha pedido.
5. **Solo entonces, código nuevo.** Y dilo explícitamente: "no hay equivalente
   en repo/plataforma/deps, implemento mínimo" — eso demuestra que bajaste la
   compuerta entera.

Lo único innegociable que NO se recorta por minimalismo: corrección, seguridad
y accesibilidad.
