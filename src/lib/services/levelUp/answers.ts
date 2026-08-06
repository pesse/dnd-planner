/**
 * Zwei Projektionen derselben Antwort: `answerValues` (englisch, kanonisch) speist die KI und
 * den Charakter, `answerLabels` (deutsch) den Bogen.
 */
import type { FeatureNote, LevelUpQuestion } from '../../schemas/levelUp';

export function hasAnswer(value: string | string[] | undefined): boolean {
  return Array.isArray(value) ? value.length > 0 : (value ?? '').toString().trim() !== '';
}

/** Zauber-Antworten sind `spell.key` — ohne Auflöser bliebe der rohe Key stehen. */
type NameOf = (key: string) => string;
const identity: NameOf = (k) => k;

/** Ein Wert ohne passende Option ist Freitext und bleibt, wie er ist. */
export function answerLabels(q: LevelUpQuestion, value: string | string[] | undefined, nameOf: NameOf = identity): string {
  if (value === undefined) return '';
  const vals = Array.isArray(value) ? value : [value];
  if (q.type === 'spell-picker') return vals.map((v) => nameOf(v)).filter((s) => s.trim()).join(', ');
  return vals.map((v) => q.options.find((o) => o.value === v)?.label ?? v).filter((s) => s.trim()).join(', ');
}

/**
 * Bei Zauber-Wahlen und Freitext identisch zu `answerLabels`: dort gibt es kein Options-Paar,
 * der Zaubername IST der Wert.
 */
export function answerValues(q: LevelUpQuestion, value: string | string[] | undefined, nameOf: NameOf = identity): string {
  if (value === undefined) return '';
  const vals = Array.isArray(value) ? value : [value];
  if (q.type === 'spell-picker') return vals.map((v) => nameOf(v)).filter((s) => s.trim()).join(', ');
  return vals.map((v) => q.options.find((o) => o.value === v)?.value ?? v).filter((s) => s.trim()).join(', ');
}

export function recordsChoice(q: LevelUpQuestion, answers: Record<string, string | string[]>): boolean {
  return !!q.featureKey && q.isBuildDecision && !!answerLabels(q, answers[q.id]);
}

/**
 * Welche Merkmale eine Bogen-Notiz bekommen, entscheidet der Notiz-Pass (leerer `sheetNote` =
 * keine) — nur er sieht, was der Bogen bereits anderswo führt.
 */
export function sheetNoteLines(notes: FeatureNote[]): string[] {
  return notes.map((n) => n.sheetNote.trim()).filter(Boolean);
}
