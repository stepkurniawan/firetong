import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  root: "frontend",
  publicDir: "public",
  plugins: [svelte()],
  build: {
    outDir: "../backend/static",
    emptyOutDir: true,
  },
});
