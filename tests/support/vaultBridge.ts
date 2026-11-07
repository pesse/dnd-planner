/**
 * Vite-Plugin für `npm run dev:vault`: der Browser bekommt die Vault-Commands per HTTP statt
 * über Tauri, damit sich die App ohne Desktop-Fenster mit echten Daten durchklicken lässt.
 */
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, sep } from 'node:path';
import type { Plugin } from 'vite';
import { READ_COMMANDS, resolveVaultPath, WRITE_COMMANDS } from './vaultCommands';

const COMMANDS: Record<string, (a: Record<string, unknown>) => unknown> = {
  ...READ_COMMANDS,
  ...WRITE_COMMANDS,
  get_current_dir: () => `cwd=${process.cwd()} | root=${process.cwd()}`,
  load_api_key: () => null,
  find_legacy_vault: () => null,
  app_version: () => (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version,
};

const MIME: Record<string, string> = {
  '.avif': 'image/avif', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};

const browserCore = new URL('./tauriCoreBrowser.ts', import.meta.url).pathname;
const browserApp = new URL('./tauriAppBrowser.ts', import.meta.url).pathname;

export function vaultBridge(): Plugin {
  const vaultDir = resolveVaultPath('./vault') + sep;
  return {
    name: 'vault-bridge',
    apply: 'serve',
    config: () => ({
      resolve: {
        alias: [
          { find: /^@tauri-apps\/api\/core$/, replacement: browserCore },
          { find: /^@tauri-apps\/api\/app$/, replacement: browserApp },
        ],
      },
      server: { fs: { allow: [browserCore, browserApp] } },
    }),
    configureServer(server) {
      server.middlewares.use('/__invoke', (req, res) => {
        const cmd = (req.url ?? '').slice(1).split('?')[0];
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          const run = COMMANDS[cmd];
          let status = 200;
          let result: unknown;
          try {
            if (!run) throw new Error(`Tauri-Command "${cmd}" gibt es in der Vault-Brücke nicht`);
            result = run(body ? JSON.parse(body) : {});
          } catch (e) {
            status = 500;
            result = e instanceof Error ? e.message : String(e);
          }
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result ?? null));
        });
      });
      server.middlewares.use('/__vault-file', (req, res, next) => {
        // Die App hängt `?v=…` an die fertige URL, das landet hinter dem kodierten Pfad.
        const file = (new URL(req.url ?? '', 'http://x').searchParams.get('p') ?? '').split('?')[0];
        if (!file.startsWith(vaultDir) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('Content-Type', MIME[extname(file).toLowerCase()] ?? 'application/octet-stream');
        createReadStream(file).pipe(res);
      });
    },
  };
}
