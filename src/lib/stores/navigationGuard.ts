import { promptDialog } from './promptDialog';

/**
 * Schützt vor Datenverlust: die aktive Karte registriert ihren Guard, `confirmNavigation`
 * fragt vor jedem Wechsel. Es ist immer nur eine Karte sichtbar, ein Slot genügt.
 */
export interface EditorGuard {
  isDirty: () => boolean;
  /** Wirft oder rejectet → die Navigation wird abgebrochen. */
  save: () => Promise<void> | void;
  discard: () => void;
}

let current: EditorGuard | null = null;

export function registerEditorGuard(guard: EditorGuard): () => void {
  current = guard;
  return () => {
    if (current === guard) current = null;
  };
}

type Choice = 'save' | 'discard' | 'cancel';

const channel = promptDialog<Record<string, never>, Choice>();

/** Treibt den UnsavedChangesDialog. */
export const unsavedPrompt = channel.prompt;

/** Vor jeder Navigation aufrufen; true heißt „darf navigieren". */
export async function confirmNavigation(): Promise<boolean> {
  if (!current || !current.isDirty()) return true;

  const choice = await channel.ask({});

  if (choice === 'cancel') return false;
  if (choice === 'save') {
    try {
      await current.save();
    } catch {
      // Fehlgeschlagen oder unvollständig (z.B. Dateiname nötig) — der Nutzer bleibt
      // auf der Karte, statt die Änderung zu verlieren.
      return false;
    }
  } else {
    current.discard();
  }
  return true;
}
