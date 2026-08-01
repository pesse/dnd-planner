/**
 * Eine Antwort in Anzeigeform (deutsche Labels) und in Modellform (englische Werte) —
 * zwei Projektionen derselben Antwort: `answerValues` speist die KI, `answerLabels` den
 * Bogen. Dazu, was davon ins Merkmals-Ledger geht und was Protokoll-Notiz bleibt.
 */
import { decodePick } from '../spellcasting';
import type { Change, FeatureRider, LevelUpQuestion } from '../../schemas/levelUp';

/** Ob eine Frage beantwortet ist — bei Mehrfachauswahl: mindestens ein Eintrag. */
export function hasAnswer(value: string | string[] | undefined): boolean {
  return Array.isArray(value) ? value.length > 0 : (value ?? '').toString().trim() !== '';
}

/**
 * Die Antwort auf eine Frage als deutsche Label-Liste (Mehrfachauswahl komma-verbunden).
 * Ein Wert ohne passende Option ist Freitext und bleibt, wie er ist.
 */
export function answerLabels(q: LevelUpQuestion, value: string | string[] | undefined): string {
  if (value === undefined) return '';
  const vals = Array.isArray(value) ? value : [value];
  // Zauber-Auswahlen tragen keine Options-Liste, sondern `encodePick`-Werte („1::Feuerball").
  if (q.type === 'spell-picker') return vals.map((v) => decodePick(v).name).filter((s) => s.trim()).join(', ');
  return vals.map((v) => q.options.find((o) => o.value === v)?.label ?? v).filter((s) => s.trim()).join(', ');
}

/**
 * Dieselbe Antwort als KANONISCHE (englische) Werte — das ist, was an die KI zurückgeht und
 * am Charakter gespeichert wird. Bei Zauber-Wahlen und Freitext identisch zu `answerLabels`:
 * dort gibt es kein Options-Paar, der Zaubername IST der Wert.
 */
export function answerValues(q: LevelUpQuestion, value: string | string[] | undefined): string {
  if (value === undefined) return '';
  const vals = Array.isArray(value) ? value : [value];
  if (q.type === 'spell-picker') return vals.map((v) => decodePick(v).name).filter((s) => s.trim()).join(', ');
  return vals.map((v) => q.options.find((o) => o.value === v)?.value ?? v).filter((s) => s.trim()).join(', ');
}

/** Ob diese Frage eine Entscheidung ins Merkmals-Ledger schreibt. */
export function recordsChoice(q: LevelUpQuestion, answers: Record<string, string | string[]>): boolean {
  return !!q.featureKey && q.isBuildDecision && !!answerLabels(q, answers[q.id]);
}

/**
 * Getroffene Feature-Wahlen (rider.decisions) als Info-Notiz (`note`) — reines Protokoll
 * für alles, was NICHT im Merkmals-Ledger landet (Wahlen pro Einsatz, Wahlen ohne
 * auflösbaren Merkmals-Key). Was `featureChoiceChanges` schon aufgenommen hat, wird über
 * `recorded` (Choice-ids) ausgelassen — sonst stünde jede Entscheidung zweimal im Protokoll.
 * `step` unterscheidet Basis- ('assemble-decisions') von Talent-Wahlen ('feat-effects').
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

/** Choice-ids, die als `featureChoice` festgehalten werden (Gegenstück zu `decisionNotes`). */
export function recordedChoiceIds(qs: LevelUpQuestion[], answers: Record<string, string | string[]>): Set<string> {
  return new Set(qs.filter((q) => recordsChoice(q, answers)).map((q) => q.id));
}

/**
 * Die von der Merkmals-Deutung verdichteten Bogen-Notizen als Textzeilen für den
 * Klassenmerkmale-Freitext. Merkmale ohne Notiz-Bedarf liefern einen leeren `sheetNote`
 * und fallen hier heraus — die Auswahl trifft bewusst die KI (Pass C, Regel 10), nicht
 * dieser Code: nur sie weiß, was der Bogen bereits anderswo führt.
 *
 * Getroffene Wahlen (rider.decisions) tauchen hier NICHT separat auf — Pass C webt ihr
 * Ergebnis in die Notiz des jeweiligen Merkmals ein. Im Protokoll bleiben sie über
 * `decisionNotes` sichtbar.
 */
export function sheetNoteLines(riders: FeatureRider[]): string[] {
  return riders.map((r) => r.sheetNote.trim()).filter(Boolean);
}
