import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Absoluter Pfad des fs-Shims, der `@tauri-apps/api/core` in der Eval ersetzt. */
const tauriCoreShim = fileURLToPath(new URL('./evals/setup/tauriInvokeShim.ts', import.meta.url));

/** SvelteKit-`$lib`-Alias (ohne SvelteKit-Plugin) → src/lib, für Produktions-Module. */
const libDir = fileURLToPath(new URL('./src/lib', import.meta.url));

/**
 * Eigenständige Vitest-Config für die Eval-/Prompt-Qualitäts-Strecke.
 *
 * Bewusst OHNE das SvelteKit-Plugin: die Evals importieren nur reine `.ts`-Bausteine
 * (Actions, Runner, Schemas) — keine `.svelte`-Komponenten, kein `$app`/`$lib`.
 * `environment: 'node'` genügt (svelte/store, zod, @anthropic-ai/sdk laufen dort),
 * und der Netzwerk-Transport fällt via `httpFetch` außerhalb von Tauri auf das
 * globale `fetch` zurück.
 *
 * Die Evals machen echte LLM-Calls und sind daher per env-Key gated
 * (siehe `describe.skipIf` in den *.eval.test.ts) — ohne Key wird nichts ausgeführt.
 */

/**
 * Minimaler, dependency-freier `.env`-Loader (Vitest lädt `.env` nicht von selbst
 * in `process.env`). Liest KEY=VALUE-Zeilen; ignoriert Kommentare/Leerzeilen und
 * entfernt umgebende Anführungszeichen. Bereits gesetzte echte Umgebungsvariablen
 * gewinnen (CI/Shell überschreibt die Datei nicht).
 */
function loadDotEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const path = fileURLToPath(new URL('.env', import.meta.url));
    const raw = readFileSync(path, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) out[key] = value;
    }
  } catch {
    // keine .env vorhanden → nur echte Umgebungsvariablen zählen
  }
  return out;
}

const dotenv = loadDotEnv();

// Echte LLM-Calls sind langsam (viele sequentielle Läufe gegen ggf. große Modelle).
// Deshalb pro Test großzügig; über EVAL_TIMEOUT_MS (env/.env) überschreibbar.
const testTimeout = Number(dotenv.EVAL_TIMEOUT_MS ?? process.env.EVAL_TIMEOUT_MS ?? 1_800_000);

export default defineConfig({
  // `invoke` (Vault-Reads) auf den Node-fs-Shim umbiegen, damit die Fixtures über den
  // ECHTEN Produktions-Ladepfad geladen werden (kein Tauri-Webview im Eval). Der Shim
  // setzt bewusst kein __TAURI_INTERNALS__ → isTauri() bleibt false → LLM-Calls via fetch.
  resolve: {
    alias: [
      { find: '@tauri-apps/api/core', replacement: tauriCoreShim },
      { find: /^\$lib(?=\/|$)/, replacement: libDir },
    ],
  },
  test: {
    environment: 'node',
    include: ['evals/**/*.test.ts'],
    testTimeout,
    hookTimeout: 60_000,
    env: dotenv,
  },
});
