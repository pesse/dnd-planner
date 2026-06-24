/**
 * Generischer, Promise-basierter Bestätigungs-Dialog (analog navigationGuard).
 * `confirmAction(...)` öffnet den Dialog und löst mit `true`/`false` auf.
 * Gerendert von components/ConfirmDialog.svelte (einmal global eingebunden).
 */
import { writable } from 'svelte/store';

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  /** Rot eingefärbter Bestätigen-Button (destruktive Aktion). */
  danger: boolean;
  resolve: (ok: boolean) => void;
}

/** Treibt den ConfirmDialog. Null = kein Dialog offen. */
export const confirmPrompt = writable<ConfirmRequest | null>(null);

export function confirmAction(opts: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    confirmPrompt.set({
      title: opts.title,
      message: opts.message,
      confirmLabel: opts.confirmLabel ?? 'OK',
      danger: opts.danger ?? false,
      resolve: (ok) => {
        confirmPrompt.set(null);
        resolve(ok);
      },
    });
  });
}
