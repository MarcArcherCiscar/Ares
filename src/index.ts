import { loadConfig } from "./config.js";
import { createBot } from "./telegram.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const bot = createBot(config);

  // Graceful shutdown
  const stop = () => {
    console.log("\nShutting down…");
    void bot.stop();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  console.log("🚀 Ares starting…");
  console.log(`   model:     ${config.model}`);
  console.log(`   workspace: ${config.workspaceDir}`);
  console.log(
    `   allowed:   ${
      config.allowedUserIds.size > 0 ? [...config.allowedUserIds].join(", ") : "EVERYONE (dev mode)"
    }`,
  );

  await bot.start({
    onStart: (info) => console.log(`✅ Connected as @${info.username}`),
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
