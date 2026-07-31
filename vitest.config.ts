import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Unit- und Integrationstests (`tests/`). LLM-frei und ohne API-Key lauffähig — die
 * Eval-Strecke mit echten Modell-Calls hat ihre eigene `vitest.evals.config.ts`.
 */

const tauriCoreShim = fileURLToPath(new URL('./tests/support/tauriInvokeShim.ts', import.meta.url));
const libDir = fileURLToPath(new URL('./src/lib', import.meta.url));

export default defineConfig({
  // `invoke` auf den Node-fs-Shim biegen: die Integrationstests lesen den ECHTEN Vault über
  // den Produktions-Ladepfad. Der Shim setzt kein __TAURI_INTERNALS__ → `isTauri()` bleibt
  // false, ein versehentlicher Netzwerk-Call fiele also auf `fetch` und nicht auf Tauri.
  resolve: {
    alias: [
      { find: '@tauri-apps/api/core', replacement: tauriCoreShim },
      { find: /^\$lib(?=\/|$)/, replacement: libDir },
    ],
  },
  test: {
    environment: 'node',
    include: ['tests/{unit,integration}/**/*.test.ts'],
    // Die Vault-weiten Abdeckungsproben lesen einige hundert JSON-Dateien.
    testTimeout: 60_000,
  },
});
