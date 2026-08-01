/**
 * Neu gewonnene Merkmale und Talente auf `GainedFeature` normalisiert — die Einheit, in der
 * Deutungs- und Deklarations-Strecke beide lesen.
 */
import { getProgressionByKey } from '../classProgression';
import { isFlowOwnedChoiceFeature, type LevelUpDelta } from '../levelUp';
import { withoutDeclaredChoiceFeatures } from '../declaration/optionList';
import { withoutSpellGrantFeatures } from '../grantedSpells';
import type { ClassFeature } from '../../schemas/classProgression';
import type { FeatureChoiceGrant } from '../../schemas/featureChoice';
import type { FeatureGrant, SpellGrant } from '../../schemas/grants';
import type { GainedFeature } from '../analysis/types';

/** Englisch geführt, deutsche Fassung als Beilage — so deutet die KI. */
export interface ChosenFeat {
  key: string;
  name: string;
  nameDe: string;
  gainedAt: number;
  desc: string;
  descDe?: string;
  grantsChoice?: FeatureChoiceGrant;
  grants?: FeatureGrant;
  grantsSpells?: SpellGrant;
}

function featureToGained(f: ClassFeature, source: 'class' | 'subclass', fromLevel: number, toLevel: number): GainedFeature {
  // Die NIEDRIGSTE Stufe innerhalb der aufgestiegenen Spanne: bei einem mehrfach vergebenen
  // Merkmal (Expertise auf 1 und 6) überschriebe die zweite Entscheidung im Ledger sonst die erste.
  const inSpan = f.gainedAt.filter((l) => l > fromLevel && l <= toLevel);
  return {
    name: f.name || f.nameDe || '',
    nameDe: f.nameDe || f.name,
    desc: f.desc || f.descDe || '',
    descDe: f.descDe,
    source,
    key: f.key ?? '',
    gainedAt: inSpan.length ? Math.min(...inSpan) : toLevel,
    grants: f.grants,
    grantsChoice: f.grantsChoice,
  };
}

function featuresBetween(features: ClassFeature[], from: number, to: number): ClassFeature[] {
  return features
    .filter((f) => f.gainedAt.some((l) => l > from && l <= to))
    .sort((a, b) => Math.min(...a.gainedAt) - Math.min(...b.gainedAt));
}

/**
 * Was hier herausfliegt, fliegt aus dem KI-Eingang:
 * - flow-eigene Wahlen (Subklasse, Attributsverbesserung) — die Analyse stellte sie sonst
 *   ein zweites Mal;
 * - immer-vorbereitete Zauberlisten, auch bei SUBKLASSEN-Merkmalen — sie werden aus der
 *   Tabelle im Merkmalstext deterministisch gelesen (`declaredSpellGrants`).
 *
 * Subklassen-Merkmale laufen bewusst NICHT durch `isFlowOwnedChoiceFeature`: dessen
 * Namens-Fallbacks („Spellcasting") treffen dort echte Mechanik — der Arkane Trickser bekäme
 * sein Zauberwirken aus keiner Quelle mehr.
 */
export function gainedFeaturesFor(delta: LevelUpDelta): GainedFeature[] {
  return [
    ...withoutSpellGrantFeatures(delta.featuresGained.filter((f) => !isFlowOwnedChoiceFeature(f)))
      .map((f) => featureToGained(f, 'class', delta.fromLevel, delta.toLevel)),
    ...withoutDeclaredChoiceFeatures(withoutSpellGrantFeatures(delta.subclassFeaturesGained))
      .map((f) => featureToGained(f, 'subclass', delta.fromLevel, delta.toLevel)),
  ];
}

/**
 * Subklassen-Merkmale NACH der Wahl nachladen, VOLLSTÄNDIG: der Aufrufer braucht sie so für
 * Info-Einträge und deklarierte Wahlen und siebt für den KI-Eingang selbst.
 */
export async function computeSubclassFeatures(subclassKey: string, from: number, to: number): Promise<GainedFeature[]> {
  const prog = await getProgressionByKey(subclassKey);
  if (!prog) return [];
  return featuresBetween(prog.features, from, to).map((f) => featureToGained(f, 'subclass', from, to));
}

export function featToGainedFeature(
  f: {
    name: string;
    nameDe?: string;
    desc: string;
    descDe?: string;
    key?: string;
    grants?: FeatureGrant;
    grantsChoice?: FeatureChoiceGrant;
    grantsSpells?: SpellGrant;
  },
  gainedAt: number,
): GainedFeature {
  return {
    name: f.name || f.nameDe || '',
    nameDe: f.nameDe || f.name,
    desc: f.desc || f.descDe || '',
    descDe: f.descDe,
    source: 'feat',
    gainedAt,
    grants: f.grants,
    grantsChoice: f.grantsChoice,
    grantsSpells: f.grantsSpells,
    ...(f.key ? { key: f.key } : {}),
  };
}
