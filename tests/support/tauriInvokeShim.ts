/**
 * Node-Ersatz für `@tauri-apps/api/core`: bedient die lesenden Vault-Commands gegen den
 * Repo-Vault, damit Fixtures über den ECHTEN Ladepfad geladen werden können.
 *
 * Bewusst KEIN `window.__TAURI_INTERNALS__` (wie `mockIPC` es setzen würde) — sonst wäre
 * `isTauri()` true und `httpFetch` schickte die LLM-Calls über den Tauri-HTTP-Pfad statt
 * über das globale `fetch`. Nur `invoke` wird ausgetauscht.
 */
import { READ_COMMANDS } from './vaultCommands';

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const run = (READ_COMMANDS as Record<string, ((a: Record<string, unknown>) => unknown) | undefined>)[cmd];
  if (!run) {
    throw new Error(
      `[eval] Tauri-Command "${cmd}" ist im Eval-Shim nicht implementiert ` +
        `(tests/support/tauriInvokeShim.ts). Nur lesende Vault-Commands werden unterstützt.`,
    );
  }
  return run(args ?? {}) as T;
}
