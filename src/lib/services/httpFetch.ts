import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

/** Tauri setzt `__TAURI_INTERNALS__` aufs `window`, bevor App-Code läuft. */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * In der App über das Tauri-HTTP-Plugin (umgeht CORS der Webview), außerhalb über das
 * globale `fetch`. Die Wahl fällt PRO AUFRUF, damit dasselbe Bundle in Browser, Node und
 * Tauri funktioniert.
 */
export const httpFetch: typeof fetch = (input, init) =>
  isTauri()
    ? (tauriFetch as typeof fetch)(input, init)
    : globalThis.fetch(input, init);
