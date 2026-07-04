import { mkdirSync, writeFileSync } from "node:fs";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  root: "frontend",
  publicDir: "public",
  plugins: [
    svelte(),
    {
      name: "preserve-backend-static-ignore",
      closeBundle() {
        mkdirSync("backend/static", { recursive: true });
        writeFileSync("backend/static/.gitignore", "*\n!.gitignore\n");
      },
    },
  ],
  build: {
    outDir: "../backend/static",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
