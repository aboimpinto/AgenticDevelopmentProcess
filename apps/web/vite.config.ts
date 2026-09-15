import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  build: {
    // Retain the existing ceiling. Mermaid 12's lazy ELK engine exceeds it;
    // keep that warning visible. Bundle tests ensure Mermaid and ELK stay
    // outside the initial dashboard graph (see CONTRIBUTING.md).
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: "react-vendor", test: /[\\/]node_modules[\\/](?:react|react-dom|scheduler)[\\/]/ }],
        },
      },
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
