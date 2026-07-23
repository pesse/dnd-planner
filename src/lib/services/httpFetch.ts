import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

/**
 * True when running inside the Tauri webview (vs. a plain browser or headless Node).
 * Tauri injects `__TAURI_INTERNALS__` onto `window` before any app code runs.
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * HTTP fetch that routes through the Tauri HTTP plugin inside the app (bypasses the
 * webview's CORS restrictions) but falls back to the platform's global `fetch` when
 * running outside Tauri — e.g. plain `vite dev` in a browser or headless Node (the
 * eval/prompt-quality harness). The choice is made per call, so the same binary
 * behaves correctly in every environment.
 */
export const httpFetch: typeof fetch = (input, init) =>
  isTauri()
    ? (tauriFetch as typeof fetch)(input, init)
    : globalThis.fetch(input, init);
