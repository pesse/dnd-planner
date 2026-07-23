import { defineConfig } from 'vitest/config';

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
export default defineConfig({
  test: {
    environment: 'node',
    include: ['evals/**/*.test.ts'],
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
