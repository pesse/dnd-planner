/**
 * Generischer, Promise-basierter Bestätigungs-Dialog.
 * Gerendert von components/ConfirmDialog.svelte (einmal global eingebunden).
 */
import { promptDialog } from './promptDialog';

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  /** Rot eingefärbter Bestätigen-Button (destruktive Aktion). */
  danger: boolean;
}

const channel = promptDialog<ConfirmRequest, boolean>();

/** Treibt den ConfirmDialog. Null = kein Dialog offen. */
export const confirmPrompt = channel.prompt;

export function confirmAction(opts: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return channel.ask({
    title: opts.title,
    message: opts.message,
    confirmLabel: opts.confirmLabel ?? 'OK',
    danger: opts.danger ?? false,
  });
}
