/**
 * Gemeinsame Prüfungen der Bogen-Notizen. Seit Wahlen und Zaubergewährung aus der
 * Deklaration kommen, ist die Notiz das EINZIGE, was die Merkmals-Deutung liefert — also
 * auch das Einzige, was hier zu messen ist.
 */
import type { FeatureNote } from '../../src/lib/schemas/levelUp';

/**
 * Obergrenze, ab der eine Notiz als „zu lang für den Bogen" gilt. Bewusst über der harten
 * Grenze des Übersetzungs-Calls (SHEET_NOTE_MAX_CHARS = 160): gemessen wird, ob die
 * Größenordnung stimmt, nicht ob auf das Zeichen genau gekürzt wird. Die Notiz entsteht
 * englisch mit ~135 Zeichen Budget und wird beim Übersetzen länger.
 */
export const SHEET_NOTE_LIMIT = 180;

export const sheetNotes = (notes: FeatureNote[]): string[] =>
  notes.map((n) => n.sheetNote.trim()).filter(Boolean);

/** Bogentauglich = einzeilig, kein Markdown-Ballast, innerhalb der Längengrenze. */
export const isSheetReady = (note: string): boolean =>
  !/[\n\r]/.test(note) && note.length <= SHEET_NOTE_LIMIT && !note.includes('**');
