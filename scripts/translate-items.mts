/**
 * Übersetzt die Gegenstands-Bibliothek `vault/items/**` per KI ins Deutsche —
 * genau über den Produktionspfad der Item-Karte: `translateItem(payload)` →
 * `runAiAction`. Pro Datei wird NUR das nachgezogen, was fehlt (`name_de` bzw.
 * `desc_de`); vorhandenes Deutsch bleibt unangetastet (außer `--force`).
 *
 * Wie in `ItemCard.applyTranslation`:
 *   - leere Rückgabefelder ("" / []) bedeuten „nicht übersetzt" und überschreiben nichts,
 *   - Distanzen werden mit `convertDistances` auf metrische Einheiten gebracht.
 *
 * Geschrieben wird das ROH-Objekt der Datei (Reihenfolge/Fremdfelder bleiben
 * erhalten) — nur `name_de`/`desc_de` kommen hinzu.
 *
 * Konfiguration wie die Eval-Strecke (dieselbe `.env`): `QM_API_KEY` + `EVAL_MODEL`,
 * optional `EVAL_MAX_TOKENS`, `EVAL_BASE_URL`. Tool-freier Einzel-Call ⇒ läuft
 * headless über das globale `fetch` (kein Tauri nötig).
 *
 * Lauf (TypeScript → über esbuild gebündelt, wie die anderen Vault-Skripte):
 *
 *   npx esbuild --bundle --platform=node --format=esm --alias:\$lib=./src/lib \
 *     scripts/translate-items.mts --outfile=/tmp/translate-items.mjs \
 *   && node /tmp/translate-items.mjs [--dry-run] [--limit N] [--concurrency N] \
 *        [--category <slug>] [--force]
 *
 *   --dry-run       nur auflisten, was übersetzt würde (kein LLM-Call, kein Schreiben)
 *   --limit N       höchstens N Gegenstände übersetzen (Test-Charge)
 *   --concurrency N parallele Übersetzungen (Default 4)
 *   --category slug nur diesen Unterordner (z.B. weapon, wondrous-item)
 *   --force         auch bereits übersetzte Felder neu übersetzen
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { LlmConfig } from '$lib/types';
import { normalizeItem } from '$lib/utils/schemaValidation';
import { translateItem } from '$lib/services/aiActions/translateAction';
import { runAiAction } from '$lib/services/aiActions/runner';
import { convertDistances } from '$lib/utils/distanceText';

const VAULT_ITEMS = 'vault/items';

// ── CLI ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const DRY_RUN = flag('dry-run');
const FORCE = flag('force');
const LIMIT = Number(opt('limit')) || Infinity;
const CONCURRENCY = Math.max(1, Number(opt('concurrency')) || 4);
const CATEGORY = opt('category');

// ── .env laden (dependency-frei, wie vitest.config.ts) ────────────────────────
// Aus dem CWD (npm run läuft im Projekt-Root — wie `vault/items` unten), NICHT
// relativ zu import.meta.url: das gebündelte Skript liegt im os.tmpdir().
function loadDotEnv(): void {
  try {
    const path = resolve(process.cwd(), '.env');
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 0) continue;
      const key = t.slice(0, eq).trim();
      let value = t.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    /* keine .env → nur echte Umgebungsvariablen zählen */
  }
}
loadDotEnv();

function buildConfig(): LlmConfig {
  const apiKey = process.env.QM_API_KEY;
  const model = process.env.EVAL_MODEL;
  if (!DRY_RUN && (!apiKey || !model)) {
    console.error('Fehlt: QM_API_KEY und/oder EVAL_MODEL (in .env oder Umgebung). Ohne sie geht nur --dry-run.');
    process.exit(2);
  }
  return {
    provider: 'qualityminds',
    model: model ?? '',
    apiKey: apiKey ?? '',
    maxTokens: Number(process.env.EVAL_MAX_TOKENS) || 4096,
    ...(process.env.EVAL_BASE_URL ? { baseUrl: process.env.EVAL_BASE_URL } : {}),
  };
}

// ── Dateien einsammeln ────────────────────────────────────────────────────────
function collectFiles(dir: string, out: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) collectFiles(full, out);
    else if (e.name.endsWith('.json')) out.push(full);
  }
}

interface Job {
  path: string;
  raw: Record<string, unknown>;
  name?: string;
  desc?: string[];
  needsName: boolean;
  needsDesc: boolean;
}

/** Plant eine Datei ein — oder null, wenn nichts (mehr) zu übersetzen ist. */
function planFile(path: string): Job | null {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    console.warn(`  ! ${rel(path)} — defektes JSON, übersprungen`);
    return null;
  }
  const item = normalizeItem(raw); // robustes Lesen (migriert Altformate); geschrieben wird `raw`
  const hasNameDe = !!item.name_de && item.name_de.trim().length > 0;
  const hasDescDe = !!item.desc_de && item.desc_de.length > 0;
  const hasDesc = item.desc.length > 0;

  const needsName = !!item.name && (FORCE || !hasNameDe);
  const needsDesc = hasDesc && (FORCE || !hasDescDe);
  if (!needsName && !needsDesc) return null;

  return {
    path,
    raw,
    name: needsName ? item.name : undefined,
    desc: needsDesc ? item.desc : undefined,
    needsName,
    needsDesc,
  };
}

const rel = (p: string) => relative(process.cwd(), p).replace(/\\/g, '/');

// ── Ausführung ────────────────────────────────────────────────────────────────
async function translateJob(config: LlmConfig, job: Job): Promise<'ok' | 'noop'> {
  const payload: Record<string, unknown> = {};
  if (job.name) payload.name = job.name;
  if (job.desc) payload.desc = job.desc;

  const run = translateItem(payload);
  const t = await runAiAction(config, run.action, run.input, { noRetry: false });

  let changed = false;
  if (job.needsName && t.name_de) {
    job.raw.name_de = convertDistances(t.name_de);
    changed = true;
  }
  if (job.needsDesc && t.desc_de.length) {
    job.raw.desc_de = t.desc_de.map(convertDistances);
    changed = true;
  }
  if (!changed) return 'noop';

  writeFileSync(job.path, JSON.stringify(job.raw, null, 2) + '\n', 'utf8');
  return 'ok';
}

/** Einfacher Worker-Pool mit fortlaufender Nummerierung im Log. */
async function runPool(config: LlmConfig, jobs: Job[]): Promise<{ ok: number; noop: number; failed: number }> {
  const total = jobs.length;
  let idx = 0;
  const stats = { ok: 0, noop: 0, failed: 0 };

  const worker = async () => {
    while (true) {
      const i = idx++;
      if (i >= jobs.length) return;
      const job = jobs[i];
      const parts = [job.needsName && 'name', job.needsDesc && 'desc'].filter(Boolean).join('+');
      try {
        const res = await translateJob(config, job);
        if (res === 'ok') stats.ok++;
        else stats.noop++;
        console.log(`  [${i + 1}/${total}] ${rel(job.path)} (${parts}) → ${res === 'ok' ? 'übersetzt' : 'leer, unverändert'}`);
      } catch (err) {
        stats.failed++;
        console.warn(`  [${i + 1}/${total}] ${rel(job.path)} (${parts}) → FEHLER: ${(err as Error).message}`);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));
  return stats;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const root = CATEGORY ? join(VAULT_ITEMS, CATEGORY) : VAULT_ITEMS;
  try {
    statSync(root);
  } catch {
    console.error(`Verzeichnis nicht gefunden: ${root}`);
    process.exit(2);
  }

  const files: string[] = [];
  collectFiles(root, files);
  files.sort();

  const jobs = files.map(planFile).filter((j): j is Job => j !== null);
  const limited = jobs.slice(0, LIMIT === Infinity ? jobs.length : LIMIT);

  console.log(
    `Gefunden: ${files.length} Dateien, davon ${jobs.length} mit fehlender Übersetzung` +
      (FORCE ? ' (--force: alle mit Quelltext)' : '') +
      `. Zu bearbeiten: ${limited.length}` +
      (limited.length < jobs.length ? ` (--limit ${LIMIT})` : '') +
      '.',
  );

  if (limited.length === 0) {
    console.log('Nichts zu tun.');
    return;
  }

  if (DRY_RUN) {
    for (const job of limited) {
      const parts = [job.needsName && 'name', job.needsDesc && 'desc'].filter(Boolean).join('+');
      console.log(`  DRY ${rel(job.path)} → würde ${parts} übersetzen`);
    }
    console.log(`\n[dry-run] ${limited.length} Gegenstände würden übersetzt. Kein LLM-Call, keine Datei geschrieben.`);
    return;
  }

  const config = buildConfig();
  console.log(`Modell: ${config.model} @ ${config.provider}, Nebenläufigkeit ${CONCURRENCY}.\n`);

  const t0 = Date.now();
  const stats = await runPool(config, limited);
  const secs = Math.round((Date.now() - t0) / 1000);

  console.log(
    `\nFertig in ${secs}s: ${stats.ok} übersetzt, ${stats.noop} ohne Änderung, ${stats.failed} fehlgeschlagen.`,
  );
  if (stats.failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
