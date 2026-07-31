import { promptDialog } from './promptDialog';

/**
 * Schützt vor Datenverlust: Ist eine Karte (Gegenstand, Monster, …) im
 * Bearbeiten-Modus mit ungespeicherten Änderungen, fragt {@link confirmNavigation}
 * vor jedem Navigationswechsel, ob gespeichert oder verworfen werden soll.
 *
 * Jeweils eine aktive Karte registriert ihren Guard via {@link registerEditorGuard}.
 * Da immer nur eine Karte gleichzeitig sichtbar ist, genügt ein einzelner Slot.
 */
export interface EditorGuard {
  /** true → es gibt ungespeicherte Änderungen, vor Navigation nachfragen. */
  isDirty: () => boolean;
  /** Speichert die Änderungen. Wirft/rejectet → Navigation wird abgebrochen. */
  save: () => Promise<void> | void;
  /** Verwirft die Änderungen (Rücksetzen auf zuletzt gespeicherten Stand). */
  discard: () => void;
}

let current: EditorGuard | null = null;

/** Registriert den Guard der aktiven Karte; gibt eine Abmelde-Funktion zurück. */
export function registerEditorGuard(guard: EditorGuard): () => void {
  current = guard;
  return () => {
    if (current === guard) current = null;
  };
}

type Choice = 'save' | 'discard' | 'cancel';

const channel = promptDialog<Record<string, never>, Choice>();

/** Treibt den UnsavedChangesDialog. Null = kein Dialog offen. */
export const unsavedPrompt = channel.prompt;

/**
 * Vor jeder Navigation aufrufen. Gibt true zurück, wenn navigiert werden darf.
 * Sind keine ungespeicherten Änderungen vorhanden, kehrt es sofort mit true zurück
 * (→ direkte Navigation). Sonst öffnet es den Dialog und wartet auf die Entscheidung.
 */
export async function confirmNavigation(): Promise<boolean> {
  if (!current || !current.isDirty()) return true;

  const choice = await channel.ask({});

  if (choice === 'cancel') return false;
  if (choice === 'save') {
    try {
      await current.save();
    } catch {
      // Speichern fehlgeschlagen oder noch unvollständig (z. B. Dateiname nötig)
      // → Navigation abbrechen, Nutzer bleibt auf der Karte.
      return false;
    }
  } else {
    current.discard();
  }
  return true;
}
