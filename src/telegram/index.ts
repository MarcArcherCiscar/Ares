import { loadConfig } from "./config.js";
import { createBot } from "./telegram.js";
import { Store } from "./store.js";
import { loadUserConfig } from "../core/config.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const store = new Store(config.dataDir);
  const bot = createBot(config, store);

  // Graceful shutdown
  const stop = () => {
    console.log("\nShutting down…");
    void bot.stop();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  const userConfig = loadUserConfig();
  console.log("🚀 Ares starting…");
  console.log(`   models:    ${userConfig.models.join(" → ")}`);
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
