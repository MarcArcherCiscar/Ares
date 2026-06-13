# Protocolo: notas del proyecto (.ares/NOTES.md)

Cuándo aplica: cuando descubres algo no obvio sobre un repo que tu yo futuro
agradecería saber al volver. Las notas viven en `<repo>/.ares/NOTES.md` y se
cargan al arrancar Ares en ese repo.

## Qué anotar
- Gotchas: "esto parece roto pero es a propósito porque…".
- Decisiones de arquitectura y su porqué (lo que no se ve en el código).
- Campos minados: "no toques X sin Y", dependencias frágiles, orden que importa.
- Comandos no obvios para correr/probar/desplegar este repo.

## Qué NO anotar
- Lo que ya está en el código, el README, el CLAUDE.md o git.
- Estado efímero de la conversación de hoy.
- Cosas de Marc (preferencias personales) — eso va a la memoria global con
  `remember`, no aquí.

## Cómo
Edita `<repo>/.ares/NOTES.md` con tus tools de archivo (créalo si no existe).
Una entrada corta por hallazgo, con el porqué. No lo conviertas en un diario:
solo lo que de verdad ahorra tiempo la próxima vez.
