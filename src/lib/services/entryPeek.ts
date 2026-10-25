/**
 * Vorschau eines Eintrags als Popup statt Seitenwechsel: global per `peekEntry`, und
 * solange ein Vollbild-Assistent offen ist, auch für jeden Verweis, der `navigateTo` ruft.
 */
import { writable } from 'svelte/store';
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

export const peekedEntry = writable<FileEntry | null>(null);

/** Klick auf ein Icon: die Karte zeigen, die aktuelle Seite bleibt stehen. */
export function peekEntry(entry: FileEntry): void {
  const peek = activePeek();
  if (peek) peek(entry);
  else peekedEntry.set(entry);
}
