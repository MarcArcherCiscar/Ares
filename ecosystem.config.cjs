// PM2 — mantiene el bot de Telegram de Ares vivo en el Mac.
//
// `caffeinate -is` evita que el Mac se duerma por inactividad (-i) y estando
// enchufado (-s) mientras el bot corre, así sigue respondiendo con la pantalla
// bloqueada. PM2 lo reinicia si crashea y lo arranca al encender (pm2 startup).
//
// Nota: cerrar la TAPA de un MacBook fuerza sleep igualmente (salvo clamshell
// con monitor externo + corriente). Para esto, deja la tapa abierta o usa
// `sudo pmset -a disablesleep 1` (agresivo: más batería/calor).
//
// Uso:
//   cd ~/Proyectos/Ares && npm run build
//   pm2 start ecosystem.config.cjs && pm2 save
//   pm2 startup        # imprime un comando con sudo: ejecútalo para auto-boot
//
//   pm2 logs ares      # ver salida
//   pm2 restart ares   # reiniciar (tras un build nuevo)
//   pm2 stop ares      # parar
module.exports = {
  apps: [
    {
      name: "ares",
      script: "caffeinate",
      args: "-is node dist/telegram/index.js",
      interpreter: "none",
      cwd: __dirname,
      autorestart: true,
      max_restarts: 20,
      restart_delay: 3000,
      time: true,
    },
  ],
};
