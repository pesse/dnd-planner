import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { createReadStream, statSync } from "node:fs";
import { resolve, sep } from "node:path";

const host = process.env.TAURI_DEV_HOST;

const VAULT_ART = resolve("vault/art");

/**
 * Im Browser ohne Tauri gibt es kein Asset-Protokoll — `artUrl` zeigt dann auf `/art/…`.
 * @returns {import("vite").Plugin}
 */
function vaultArt() {
  return {
    name: "vault-art",
    configureServer(server) {
      server.middlewares.use("/art", (req, res, next) => {
        const file = resolve(VAULT_ART, "." + decodeURIComponent((req.url ?? "").split("?")[0]));
        if (!file.startsWith(VAULT_ART + sep)) return next();
        try {
          if (!statSync(file).isFile()) return next();
        } catch {
          return next();
        }
        res.setHeader("Content-Type", "image/avif");
        createReadStream(file).pipe(res);
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [vaultArt(), sveltekit()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // design/: Codex schreibt dort Bilder; eine gesperrte Datei bringt den Watcher unter Windows zum Absturz.
      // .claude/: Worktrees sind volle Repo-Kopien samt node_modules und Vault.
      ignored: ["**/src-tauri/**", "**/design/**", "**/.claude/**"],
    },
  },
}));
