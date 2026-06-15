import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Serves the visual-test harness (index.html + main.tsx). The harness imports
// the view straight from ../../src, so changes to the package are picked up with
// no build step.
export default defineConfig({
  plugins: [react()],
  server: { fs: { allow: ["../.."] } },
});
