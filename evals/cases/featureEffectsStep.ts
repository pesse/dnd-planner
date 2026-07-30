/**
 * Gemeinsamer Ergebnistyp der featureEffects-Fälle.
 *
 * Beide Phasen des Produktionspfads werden in derselben Strecke gemessen, liefern aber
 * unterschiedliche Ergebnisse: Call 1 die Analyse (Choices + zu erdende Zauber), Call C
 * die fertigen Rider. Ein Summentyp hält sie auseinander, ohne die Assertions zu trennen.
 */
import type { FeatureEffects } from '../../src/lib/schemas/levelUp';
import type { FeatureAnalysis } from '../../src/lib/services/aiActions/featureEffectsAction';

export type StepResult =
  | { kind: 'analysis'; analysis: FeatureAnalysis }
  | { kind: 'effects'; effects: FeatureEffects };

export const asAnalysis = (r: StepResult): FeatureAnalysis | null => (r.kind === 'analysis' ? r.analysis : null);
export const asEffects = (r: StepResult): FeatureEffects | null => (r.kind === 'effects' ? r.effects : null);

// ── Bogen-Notizen (sheetNote) ────────────────────────────────────────────────────
/**
 * Obergrenze, ab der eine Notiz als „zu lang für den Bogen" gilt. Bewusst über dem
 * Prompt-Richtwert (SHEET_NOTE_MAX_CHARS = 100): gemessen wird, ob das Modell die
 * Größenordnung trifft, nicht ob es auf das Zeichen genau kürzt.
 */
export const SHEET_NOTE_LIMIT = 140;

/** Die nicht-leeren Bogen-Notizen des Ergebnisses. */
export const sheetNotes = (r: StepResult): string[] =>
  (asEffects(r)?.riders ?? []).map((x) => x.sheetNote.trim()).filter(Boolean);

/** Bogentauglich = einzeilig, kein Markdown-Ballast, innerhalb der Längengrenze. */
export const isSheetReady = (note: string): boolean =>
  !/[\n\r]/.test(note) && note.length <= SHEET_NOTE_LIMIT && !note.includes('**');
