import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config.js";

// IMPORTANT: do not add `build.rollupOptions.input` here.
// @crxjs/vite-plugin v2 auto-derives entries from the manifest
// (side_panel.default_path, options_page, content_scripts, background.service_worker).
// Declaring HTML inputs explicitly puts the plugin into an inconsistent state and
// the internal Vite manifest is never emitted, which causes:
//   "[crx:content-script-resources] Error: vite manifest is missing"
export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    manifest: true,
  },
  server: {
    port: 5174,
    strictPort: true,
    hmr: {
      port: 5174,
    },
  },
});
