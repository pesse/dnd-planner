/**
 * CLI-Wrapper für die Evals: übersetzt `--flags` in `EVAL_*`-Env-Variablen und
 * startet dann Vitest (identisch zu `vitest run --config vitest.config.ts`, nur mit
 * angereicherter Umgebung). So lassen sich Titel/Beschreibung/Prompt bequem als
 * CLI-Parameter übergeben — plattformunabhängig, auch aus Windows PowerShell —
 * statt vorher env-Variablen zu setzen.
 *
 *   npm run eval -- --prompt candidate --title kurz-v1 --desc "ASI-Regel gekürzt"
 *   npm run eval -- --runs 3 --concurrency 1          # saubere Einzel-Latenz
 *   npm run eval -- --help
 *
 * Flags überschreiben die `.env`; nicht gesetzte Flags fallen auf `.env`/Defaults
 * zurück. Vitest-Worker erben `process.env`, daher greifen die Werte in den Tests.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

/** Flag → Env-Variable, die die Eval liest. */
const FLAGS = {
  prompt: 'EVAL_PROMPT',
  title: 'EVAL_TITLE',
  desc: 'EVAL_DESC',
  runs: 'EVAL_RUNS',
  threshold: 'EVAL_THRESHOLD',
  concurrency: 'EVAL_CONCURRENCY',
  model: 'EVAL_MODEL',
  'api-key': 'QM_API_KEY',
};

function printHelp() {
  console.log(
    'Eval-CLI — Flags werden in EVAL_*-Env übersetzt:\n' +
      Object.entries(FLAGS)
        .map(([flag, env]) => `  --${flag} <wert>   → ${env}`)
        .join('\n') +
      '\n\nBeispiel: npm run eval -- --prompt candidate --title kurz-v1 --desc "..."',
  );
}

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === '--help' || arg === '-h') {
    printHelp();
    process.exit(0);
  }
  const match = /^--([^=]+)(?:=(.*))?$/.exec(arg);
  if (!match) {
    console.error(
      `Unerwartetes Argument: ${arg}\n` +
        'Tipp: Flags müssen NACH "--" stehen, sonst schluckt npm sie selbst:\n' +
        '  npm run eval -- --title "baseline" --concurrency 5',
    );
    printHelp();
    process.exit(2);
  }
  const [, key, inlineVal] = match;
  const env = FLAGS[key];
  if (!env) {
    console.error(`Unbekanntes Flag: --${key}`);
    printHelp();
    process.exit(2);
  }
  // Wert = "--flag=wert" oder nächstes Argument (sofern kein weiteres Flag).
  const value = inlineVal ?? (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[++i] : '');
  process.env[env] = value;
}

// Vitest-Bin robust über package.json auflösen (unabhängig vom exports-Feld).
const pkgPath = require.resolve('vitest/package.json');
const pkg = require('vitest/package.json');
const binRel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.vitest;
const vitestBin = join(dirname(pkgPath), binRel);

const child = spawn(process.execPath, [vitestBin, 'run', '--config', 'vitest.config.ts'], {
  stdio: 'inherit',
  env: process.env,
});
child.on('exit', (code) => process.exit(code ?? 1));
