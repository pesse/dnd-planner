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
