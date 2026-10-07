import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // npm workspaces runs Vite in apps/web, while the documented .env lives at
  // the monorepo root. Only VITE_ variables are exposed to browser code.
  envDir: mode === "test" ? false : fileURLToPath(new URL("../../", import.meta.url)),
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@mindcanvas/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)),
    },
  },
  server: { port: 5173 },
}));
