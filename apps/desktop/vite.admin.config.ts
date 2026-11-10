// Next POS Cloud admin website (static; hosted on Vercel). Dev server on 1423.
import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, renameSync, writeFileSync } from "fs";
import { resolve } from "path";

const outDir = resolve(__dirname, "dist-admin");

/** The page is admin.html; the host expects index.html. */
function adminEntry(): Plugin {
  return {
    name: "nextpos-admin-entry",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === "/" || req.url === "/index.html") req.url = "/admin.html";
        next();
      });
    },
    closeBundle() {
      const from = resolve(outDir, "admin.html");
      if (existsSync(from)) renameSync(from, resolve(outDir, "index.html"));
      writeFileSync(
        resolve(outDir, "vercel.json"),
        JSON.stringify(
          {
            headers: [
              {
                source: "/(.*)",
                headers: [
                  { key: "X-Frame-Options", value: "DENY" },
                  { key: "X-Content-Type-Options", value: "nosniff" },
                  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                ],
              },
            ],
          },
          null,
          2
        )
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), adminEntry()],
  publicDir: false,
  clearScreen: false,
  server: { port: 1423, strictPort: true },
  envPrefix: ["VITE_"],
  build: {
    outDir,
    emptyOutDir: true,
    target: ["es2021", "chrome100", "safari14"],
    rollupOptions: { input: resolve(__dirname, "admin.html") },
  },
});
