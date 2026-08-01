/**
 * Normalisierung der neu gewonnenen Merkmale und Talente auf `GainedFeature` — die
 * Einheit, in der die Deutungs-Strecke und die Deklarations-Strecke beide lesen.
 */
import { getProgressionByKey } from '../classProgression';
import { isFlowOwnedChoiceFeature, type LevelUpDelta } from '../levelUp';
import { withoutDeclaredChoiceFeatures } from '../declaration/optionList';
import { withoutSpellGrantFeatures } from '../grantedSpells';
import type { ClassFeature } from '../../schemas/classProgression';
import type { FeatureChoiceGrant } from '../../schemas/featureChoice';
import type { FeatureGrant, SpellGrant } from '../../schemas/grants';
import type { GainedFeature } from '../analysis/types';

/** Ein im Aufstieg gewähltes Talent: englisch geführt, deutsche Fassung als Beilage. */
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
  // Die Stufe ist die NIEDRIGSTE innerhalb der aufgestiegenen Spanne — bei einem mehrfach
  // vergebenen Merkmal (Expertise auf 1 und 6) sonst immer die erste Vergabe, womit die
  // zweite Entscheidung im Ledger die erste überschreiben würde.
  const inSpan = f.gainedAt.filter((l) => l > fromLevel && l <= toLevel);
  // Englisch geführt (so deutet die KI), deutsche Fassung als Quelle der Übersetzungs-Calls.
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

/** Merkmale, die eine Progression in der Spanne (from, to] erlangt. */
function featuresBetween(features: ClassFeature[], from: number, to: number): ClassFeature[] {
  return features
    .filter((f) => f.gainedAt.some((l) => l > from && l <= to))
    .sort((a, b) => Math.min(...a.gainedAt) - Math.min(...b.gainedAt));
}

/**
 * Basis- + (falls bereits bekannt) Subklassen-Merkmale aus dem Delta als GainedFeature[].
 *
 * Klassenmerkmale, die nur auf eine vom Flow selbst getroffene Entscheidung zeigen
 * (Subklassen-Wahl, Attributsverbesserung), fliegen hier raus: die Wahl ist beim
 * Merkmals-Schritt längst gefallen, ihre Prosa würde die Analyse aber dazu verleiten,
 * sie ein zweites Mal zu stellen.
 *
 * Ebenso raus — und hier auch bei SUBKLASSEN-Merkmalen — fliegen die immer-vorbereiteten
 * Zauberlisten (Kreissprüche, Domänenzauber …): sie stehen als Tabelle im Merkmalstext und
 * werden deterministisch gelesen (`declaredSpellGrants`). Sie im Eingang zu lassen hieße,
 * das Modell eine Liste abschreiben zu lassen, die schon als Daten vorliegt.
 *
 * Subklassen-Merkmale laufen bewusst NICHT durch `isFlowOwnedChoiceFeature`, sondern nur durch
 * `withoutDeclaredChoiceFeatures`: dessen Namens-Fallbacks („Spellcasting") treffen bei einer
 * Subklasse ein Merkmal mit echter Mechanik — der Arkane Trickser bekäme sein Zauberwirken aus
 * keiner Quelle mehr, weil die Stufentabelle der Grundklasse keine Zauberspalte hat.
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
 * Zweiter deterministischer Pass: Subklassen-Merkmale NACH der Wahl nachladen.
 *
 * Liefert sie VOLLSTÄNDIG — der Aufrufer braucht sie so für die Info-Einträge („Neues
 * Merkmal: …") und die deklarierten Wahlen; für den KI-Eingang siebt er mit denselben zwei
 * Filtern wie `gainedFeaturesFor`.
 */
export async function computeSubclassFeatures(subclassKey: string, from: number, to: number): Promise<GainedFeature[]> {
  const prog = await getProgressionByKey(subclassKey);
  if (!prog) return [];
  return featuresBetween(prog.features, from, to).map((f) => featureToGained(f, 'subclass', from, to));
}

/** Ein Talent als GainedFeature für die Effekt-Deutung (englisch geführt, DE als Beilage). */
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
