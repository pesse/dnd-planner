/**
 * Die aufgelöste Zauberquelle: die Deklaration eines Merkmals plus das, was nicht im Vault
 * steht — Identität, Label, Bezugsstufe, beantwortete Zweigwahl.
 * Plan: `docs/plan/plan-zauberquellen.md`.
 */
import type { AbilityBinding, Quota, SwapRule } from '$lib/schemas/casting';
export type { AbilityBinding, CastOption, Quota, SpellPool, SwapRule } from '$lib/schemas/casting';
import type { DeclarationIssue } from '../declaration/carriers';
import { declarationIssue, originCountsClassLevel } from '../declaration/carriers';
import type { FeatureSource } from '../declaredFeature';

/** Bestimmt die Bezugsstufe und später die Bogen-Zeile; deckungsgleich mit `FeatureSource`. */
export type CastingOrigin = FeatureSource;

export { originCountsClassLevel };

export interface CastingSource {
  /** Merkmals-Key; nur eine WIEDERHOLTE Quelle (Eingeweihter der Magie ×2) trägt einen Zusatz. */
  id: string;
  featureKey: string;
  origin: CastingOrigin;
  name: string;
  labelDe: string;
  /** Klassenmerkmal → Klassenstufe, Trait/Talent → Charakterstufe. */
  levelRef: 'class' | 'character';
  /** Die maßgebliche Stufe, nach `levelRef` schon gewählt. */
  level: number;
  /** Klasse, deren Stufentabelle die Spalten speist; leer bei Trait und Talent. */
  classKey: string;
  /** ENGLISCH — `pool.fromDescTable` liest die Zauber-Tabelle daraus. */
  desc: string;
  ability?: AbilityBinding;
  /** Vorgabe für alle Quotas dieser Quelle; `cast` erbt nicht mit. */
  swap: SwapRule;
  /** `patches` sind angewandt, `since` gesetzt, `pool.from` und `into` zeigen auf Quellen-Ids. */
  quotas: Quota[];
  /** Antwort auf das `optionList` DESSELBEN Merkmals; `when` prüft dagegen. */
  branch: string;
}

/** Deklarationsfehler im Vault; ohne Meldung gewährt das Merkmal einfach nichts. */
export type CastingIssueKind =
  | 'unlinkedClass'
  | 'unknownClassKey'
  | 'undeclaredCasting'
  | 'unresolvedPatch'
  | 'unresolvedPool'
  | 'unresolvedPoolTarget'
  | 'unresolvedAbilityRef'
  | 'unreadableSpellTable'
  | 'unknownBranchKey'
  | 'unknownSpell';

export type CastingIssue = DeclarationIssue<CastingIssueKind>;

export const castingIssue = (
  kind: CastingIssueKind,
  featureKey: string,
  detail: string,
): CastingIssue => declarationIssue(kind, featureKey, detail);

/** Die Vorgabe der Quelle, von der Quota feldweise überschrieben. */
export function quotaSwap(source: CastingSource, quota: Quota): SwapRule {
  return { ...source.swap, ...quota.swap };
}
