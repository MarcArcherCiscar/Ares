import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { join } from "node:path";

/**
 * Builds an in-process MCP server exposing a `screenshot` tool the manager
 * agent can call (e.g. after making UI changes). Screenshots are written to
 * `outputDir`; the Telegram layer scans that directory after the run and sends
 * any images to the user — see src/telegram.ts.
 *
 * Playwright is imported lazily so the bot still runs when browsers aren't
 * installed; the tool returns a clear error in that case.
 */
export function createScreenshotServer(outputDir: string) {
  let counter = 0;

  return createSdkMcpServer({
    name: "ares",
    version: "0.1.0",
    tools: [
      tool(
        "screenshot",
        "Capture a screenshot of a web page or local dev server URL and send it " +
          "to the user on Telegram. Use this to show UI changes you made.",
        {
          url: z.string().describe("URL to screenshot, e.g. http://localhost:3000"),
          fullPage: z.boolean().optional().describe("Capture the full scrollable page"),
          selector: z.string().optional().describe("CSS selector to screenshot just one element"),
          label: z.string().optional().describe("Short caption shown with the image"),
          viewportWidth: z.number().optional().describe("Viewport width in px (default 1280)"),
          viewportHeight: z.number().optional().describe("Viewport height in px (default 800)"),
        },
        async (args) => {
          try {
            const { chromium } = await import("playwright");
            const browser = await chromium.launch();
            try {
              const page = await browser.newPage({
                viewport: {
                  width: args.viewportWidth ?? 1280,
                  height: args.viewportHeight ?? 800,
                },
              });
              await page.goto(args.url, { waitUntil: "networkidle", timeout: 30_000 });

              const safeLabel = (args.label ?? "screenshot").replace(/[^\w.-]+/g, "_").slice(0, 40);
              const filename = `${String(++counter).padStart(2, "0")}-${safeLabel}.png`;
              const path = join(outputDir, filename);

              if (args.selector) {
                const el = await page.locator(args.selector).first();
                await el.screenshot({ path });
              } else {
                await page.screenshot({ path, fullPage: args.fullPage ?? false });
              }

              return {
                content: [
                  {
                    type: "text",
                    text: `Captured ${args.url} → ${filename}. It will be sent to the user automatically.`,
                  },
                ],
              };
            } finally {
              await browser.close();
            }
          } catch (err) {
            const msg = (err as Error).message;
            const hint = /Executable doesn't exist|browserType.launch/.test(msg)
              ? " (run `npx playwright install chromium` to install the browser)"
              : "";
            return {
              content: [{ type: "text", text: `Screenshot failed: ${msg}${hint}` }],
              isError: true,
            };
          }
        },
      ),
    ],
  });
}
