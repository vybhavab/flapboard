import { copyFileSync } from "node:fs";

import { defineConfig } from "tsup";

/**
 * Build the publishable artifact: ESM JS + `.d.ts` for both the framework-
 * agnostic core (`index`) and the React view (`react`), with React kept
 * external so the host app dedupes it. The stylesheet is copied verbatim into
 * `dist` so `flapboard/styles.css` resolves for external consumers.
 */
export default defineConfig({
  entry: { index: "src/index.ts", react: "src/react.tsx" },
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ["react", "react-dom", "react/jsx-runtime"],
  onSuccess: async () => {
    copyFileSync("src/styles.css", "dist/styles.css");
  },
});
