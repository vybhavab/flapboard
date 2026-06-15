import { defineConfig, devices } from "@playwright/test";

const visualPort = Number(process.env.FLAP_BOARD_VISUAL_PORT ?? 5173);
const visualHost = "127.0.0.1";
const visualURL = `http://${visualHost}:${visualPort}`;

/**
 * Visual tests render the real React view in Chromium against a tiny Vite-served
 * harness (test/harness) that exposes a deterministic engine on `window.__flap`
 * (seeded RNG + manual clock). Snapshots are committed next to the specs so the
 * actual/expected/diff overlay shows up in the HTML report on any drift.
 */
export default defineConfig({
  testDir: "./test/visual",
  snapshotDir: "./test/visual/__screenshots__",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }]],
  expect: {
    toHaveScreenshot: { maxDiffPixels: 80 },
    // The onion-skin composite is a generated PNG; keep a small tolerance for
    // cross-platform encoder jitter without letting real changes slip through.
    toMatchSnapshot: { maxDiffPixelRatio: 0.01 },
  },
  use: {
    baseURL: visualURL,
    viewport: { width: 1100, height: 520 },
    deviceScaleFactor: 1,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1100, height: 520 },
      },
    },
  ],
  webServer: {
    command: `vite --host ${visualHost} --port ${visualPort} --strictPort test/harness`,
    url: visualURL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
