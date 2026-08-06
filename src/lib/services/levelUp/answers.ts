/**
 * Zwei Projektionen derselben Antwort: `answerValues` (englisch, kanonisch) speist die KI und
 * den Charakter, `answerLabels` (deutsch) den Bogen.
 */
import type { Change, FeatureRider, LevelUpQuestion } from '../../schemas/levelUp';

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
 * Protokoll-Notiz für alles, was NICHT ins Merkmals-Ledger geht (Wahlen pro Einsatz, Wahlen
 * ohne auflösbaren Merkmals-Key). `recorded` lässt aus, was `featureChoiceChanges` schon
 * aufgenommen hat — sonst stünde jede Entscheidung zweimal im Protokoll.
 */
export function decisionNotes(
  riders: FeatureRider[],
  step: 'assemble-decisions' | 'feat-effects',
  recorded: Set<string> = new Set(),
): Change[] {
  const out: Change[] = [];
  for (const r of riders) {
    for (const d of r.decisions) {
      if (!d.answer?.trim() || recorded.has(d.id)) continue;
      out.push({ target: 'note', value: d.answer, step, source: r.featureName || 'feature', label: `${d.question}: ${d.answer}` });
    }
  }
  return out;
}

/** Gegenstück zu `decisionNotes`: was als `featureChoice` festgehalten wird. */
export function recordedChoiceIds(qs: LevelUpQuestion[], answers: Record<string, string | string[]>): Set<string> {
  return new Set(qs.filter((q) => recordsChoice(q, answers)).map((q) => q.id));
}

/**
 * Welche Merkmale eine Bogen-Notiz bekommen, entscheidet Pass C (leerer `sheetNote` = keine) —
 * nur die KI weiß, was der Bogen bereits anderswo führt. Getroffene Wahlen webt sie in die
 * Notiz des Merkmals ein, statt sie hier separat zu führen.
 */
export function sheetNoteLines(riders: FeatureRider[]): string[] {
  return riders.map((r) => r.sheetNote.trim()).filter(Boolean);
}
