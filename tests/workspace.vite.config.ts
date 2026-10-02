import { defineConfig } from "vite";
import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";

// Standalone Vite serves the HTML test harness without SvelteKit's route fallback.
export default defineConfig({
  plugins: [svelte({ configFile: false, preprocess: vitePreprocess() })],
  server: { host: "127.0.0.1", port: 5174, strictPort: true },
});
