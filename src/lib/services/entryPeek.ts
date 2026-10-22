/**
 * Solange ein Vollbild-Assistent offen ist, öffnet ein Verweis eine Vorschau statt die Seite
 * zu wechseln — `navigateTo` würde den Assistenten samt allen Wahlen schließen.
 */
import type { FileEntry } from '../types';

type Peek = (entry: FileEntry) => void;

const peeks: Peek[] = [];

/** Liefert die Abmeldung. Verschachtelte Assistenten: der zuletzt geöffnete gewinnt. */
export function interceptNavigation(peek: Peek): () => void {
  peeks.push(peek);
  return () => {
    const i = peeks.lastIndexOf(peek);
    if (i >= 0) peeks.splice(i, 1);
  };
}

export const activePeek = (): Peek | undefined => peeks.at(-1);
