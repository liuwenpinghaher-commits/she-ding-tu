import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiTarget = process.env.SETTING_API_URL || "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.VITE_PORT || 5173),
    proxy: {
      "/api": apiTarget,
      "/health": apiTarget,
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
