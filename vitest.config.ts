import { defineConfig } from "vitest/config";

/**
 * The engine, drum, layout and timing modules are DOM-free (the engine takes an
 * injectable clock/rAF/random), so the unit suite runs in plain Node — fast, no
 * jsdom. The React view and anything pixel-shaped is covered by Playwright
 * instead (test/visual), which we exclude here.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/unit/**/*.test.ts"],
  },
});
