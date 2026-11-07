// Phone app screens (Next POS Mobile, Android). Built into dist-mobile for
// apps/mobile/src-tauri. Dev server on 1421 so it never clashes with the PC app.
import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { renameSync, existsSync } from "fs";
import { resolve } from "path";

const host = process.env.TAURI_DEV_HOST;
const outDir = resolve(__dirname, "dist-mobile");

/** The phone page is mobile.html; the app expects index.html. */
function mobileEntry(): Plugin {
  return {
    name: "nextpos-mobile-entry",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === "/" || req.url === "/index.html") req.url = "/mobile.html";
        next();
      });
    },
    closeBundle() {
      const from = resolve(outDir, "mobile.html");
      if (existsSync(from)) renameSync(from, resolve(outDir, "index.html"));
    },
  };
}

export default defineConfig({
  plugins: [react(), mobileEntry()],
  publicDir: false,
  clearScreen: false,
  server: {
    port: 1421,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1422 } : undefined,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    outDir,
    emptyOutDir: true,
    target: ["es2021", "chrome100"],
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    rollupOptions: { input: resolve(__dirname, "mobile.html") },
  },
});
