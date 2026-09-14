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
    rollupOptions: {
      output: { manualChunks: { "react-vendor": ["react", "react-dom", "react-dom/client"] } },
    },
  },
  plugins: [react()],
  server: {
    port: Number(process.env.HEPHA_WEB_PORT ?? "5176"),
    proxy: {
      "/api": `http://127.0.0.1:${process.env.HEPHA_ORCHESTRATOR_PORT ?? "4318"}`,
    },
    strictPort: true,
  },
});
