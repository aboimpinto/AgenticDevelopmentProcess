import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  build: {
    // Mermaid is already loaded through a dynamic import. Its Cynefin parser
    // is distributed as one precompiled module (~691 kB minified/~155 kB
    // gzip), so Rollup has no safe internal module boundary to split. Keep a
    // narrow ceiling above that known lazy vendor chunk so future growth still
    // restores the warning.
    chunkSizeWarningLimit: 700,
  },
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:4317",
    },
    strictPort: false,
  },
});
