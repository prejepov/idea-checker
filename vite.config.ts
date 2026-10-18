import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiPort = Number(process.env.IDEA_CHECKER_PORT ?? 3001);
const webPort = Number(process.env.IDEA_CHECKER_WEB_PORT ?? 5173);

export default defineConfig({
  root: "web",
  plugins: [react()],
  server: {
    port: webPort,
    strictPort: true,
    proxy: { "/api": `http://localhost:${apiPort}` },
  },
  build: { outDir: "../dist/web", emptyOutDir: true },
});
