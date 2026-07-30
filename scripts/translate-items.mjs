/**
 * Build+Run-Wrapper für `scripts/translate-items.mts` (npm-Einstieg).
 *
 * Wie `evals/cli.mjs`: bündelt die TypeScript-Quelle über die esbuild-JS-API
 * (löst `$lib` als Alias auf — würde in einem package.json-Shell-String je nach
 * Plattform expandiert/anders gequotet) und startet dann `node` auf dem Ergebnis.
 * Alle CLI-Argumente werden 1:1 durchgereicht.
 *
 *   npm run translate:items -- --dry-run --limit 5
 *   npm run translate:items -- --limit 3 --concurrency 1
 *   npm run translate:items -- --category weapon
 */
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, 'translate-items.mts');
const outfile = join(tmpdir(), 'translate-items.bundle.mjs');

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  alias: { $lib: join(here, '..', 'src', 'lib') },
  logLevel: 'warning',
});

const child = spawn(process.execPath, [outfile, ...process.argv.slice(2)], { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 1));
