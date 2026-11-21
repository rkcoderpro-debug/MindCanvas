import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { readFileSync } from "node:fs";
import packageJson from "./package.json";

export default defineConfig(({ mode }) => ({
  plugins: [react(), {
    name: "mindcanvas-service-worker-version",
    apply: "build",
    generateBundle() {
      const source = readFileSync(new URL("./public/sw.js", import.meta.url), "utf8");
      if (!source.includes("__APP_VERSION__")) throw new Error("Service worker version placeholder is missing.");
      this.emitFile({ type: "asset", fileName: "sw.js", source: source.replaceAll("__APP_VERSION__", packageJson.version) });
    },
  }],
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
