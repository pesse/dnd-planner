/**
 * Die Bogen-Zeilen der neu gewonnenen Merkmale — die formulierten aus dem Notiz-Pass und die
 * deterministische Ersatzfassung, wenn er nicht laufen konnte.
 */
import { SHEET_NOTE_MAX_CHARS, type FeatureNote } from '../../schemas/levelUp';
import type { GainedFeature } from '../analysis/types';

/**
 * Welche Merkmale eine Bogen-Notiz bekommen, entscheidet der Notiz-Pass (leerer `sheetNote` =
 * keine) — nur er sieht, was der Bogen bereits anderswo führt.
 */
export function sheetNoteLines(notes: FeatureNote[]): string[] {
  return notes.map((n) => n.sheetNote.trim()).filter(Boolean);
}

function firstSentence(text: string): string {
  const flat = text.replace(/\s*[\r\n]+\s*/g, ' ').trim();
  return /^(.*?[.!?])(\s|$)/.exec(flat)?.[1] ?? flat;
}

function clamp(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${cut.slice(0, space > 0 ? space : cut.length).trimEnd()}…`;
}

/**
 * Die Bogen-Notizen OHNE KI: deutscher Merkmalsname plus erster Satz der Regelprosa. Sie liest
 * sich ungelenker als eine formulierte Zeile — aber ein Merkmal, das gar nicht auf dem Bogen
 * steht, ist der teurere Fehler, und am `class-features`-Checkpoint wird ohnehin editiert.
 */
export function fallbackSheetNotes(features: readonly GainedFeature[]): FeatureNote[] {
  const seen = new Set<string>();
  const notes: FeatureNote[] = [];
  for (const f of features) {
    const name = f.nameDe || f.name;
    const id = f.key || name;
    if (!name || seen.has(id)) continue;
    seen.add(id);
    const sentence = firstSentence(f.descDe || f.desc);
    notes.push({
      featureName: f.name,
      featureKey: f.key ?? '',
      sheetNote: clamp(sentence ? `${name}: ${sentence}` : name, SHEET_NOTE_MAX_CHARS),
    });
  }
  return notes;
}
