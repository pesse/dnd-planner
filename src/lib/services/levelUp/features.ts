/**
 * Neu gewonnene Merkmale und Talente auf `GainedFeature` normalisiert — die Einheit, in der
 * Deutungs- und Deklarations-Strecke beide lesen.
 */
import { getProgressionByKey } from '../classProgression';
import { isFlowOwnedChoiceFeature, type LevelUpDelta } from '../levelUp';
import { withoutDeclaredChoiceFeatures, type DeclaredChoiceSource } from '../declaration/optionList';
import { isSpellAccessFeature } from '../declaration/casting';
import { declarationOf, type DeclarationFields } from '../declaredFeature';
import { withoutSpellGrantFeatures, type SpellGrantSource } from '../grantedSpells';
import { spellAccessGrantOf, type SpellAccessGrant } from '../spellcasting/access';
import type { ClassFeature } from '../../schemas/classProgression';
import type { GainedFeature } from '../analysis/types';

/** Englisch geführt, deutsche Fassung als Beilage — so deutet die KI. */
export interface ChosenFeat extends DeclarationFields {
  key: string;
  name: string;
  nameDe: string;
  gainedAt: number;
  desc: string;
  descDe?: string;
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
    ...declarationOf(f),
  };
}

function featuresBetween(features: ClassFeature[], from: number, to: number): ClassFeature[] {
  return features
    .filter((f) => f.gainedAt.some((l) => l > from && l <= to))
    .sort((a, b) => Math.min(...a.gainedAt) - Math.min(...b.gainedAt));
}

/**
 * Der KI-Eingang der SUBKLASSEN-Merkmale, eine Regel für beide Aufrufer: deklarierte Wahlen,
 * deklariertes Zauberwirken und immer-vorbereitete Zauberlisten fliegen raus — die drei
 * beantwortet der Flow aus der Bibliothek, die Analyse stellte sie sonst ein zweites Mal.
 * Klassenmerkmale deckt `isFlowOwnedChoiceFeature` ab, das hier nicht laufen darf: seine
 * Namens-Fallbacks („Spellcasting") treffen an der Subklasse echte Mechanik.
 */
export function subclassFeaturesForAi<T extends DeclaredChoiceSource & SpellGrantSource>(features: T[]): T[] {
  return withoutDeclaredChoiceFeatures(withoutSpellGrantFeatures(features));
}

/**
 * Was hier herausfliegt, fliegt aus dem KI-Eingang:
 * - flow-eigene Wahlen (Subklasse, Attributsverbesserung) — die Analyse stellte sie sonst
 *   ein zweites Mal;
 * - immer-vorbereitete Zauberlisten, auch bei SUBKLASSEN-Merkmalen — sie werden aus der
 *   Tabelle im Merkmalstext deterministisch gelesen (`declaredSpellGrants`).
 */
export function gainedFeaturesFor(delta: LevelUpDelta): GainedFeature[] {
  return [
    ...withoutSpellGrantFeatures(delta.featuresGained.filter((f) => !isFlowOwnedChoiceFeature(f)))
      .map((f) => featureToGained(f, 'class', delta.fromLevel, delta.toLevel)),
    ...subclassFeaturesForAi(delta.subclassFeaturesGained)
      .map((f) => featureToGained(f, 'subclass', delta.fromLevel, delta.toLevel)),
  ];
}

/**
 * Die deklarierten Zauber-Zugänge der Klasse für DIESE Spanne — aus der ganzen Progression,
 * nicht nur aus den neu gewonnenen Merkmalen: das Kontingent eines längst erworbenen Merkmals
 * wächst mit der Stufe („whenever you gain access to a new level of spell slots"), und der
 * Zuwachs fiele sonst aus. `fromLevel` sorgt dafür, dass nur er gefragt wird.
 */
export async function classAccessGrants(
  delta: Pick<LevelUpDelta, 'sourceKey' | 'subclassKey' | 'fromLevel' | 'toLevel'>,
  subclassKey = '',
): Promise<SpellAccessGrant[]> {
  const progs = await Promise.all(
    [delta.sourceKey, subclassKey || delta.subclassKey].filter(Boolean).map(getProgressionByKey),
  );
  const grants: SpellAccessGrant[] = [];
  for (const prog of progs) {
    for (const f of prog?.features ?? []) {
      if (!isSpellAccessFeature(f) || !f.gainedAt.some((l) => l <= delta.toLevel)) continue;
      const grant = spellAccessGrantOf(
        { ...f, key: f.key },
        { level: delta.toLevel, fromLevel: delta.fromLevel, gainedAt: Math.min(...f.gainedAt) },
      );
      if (grant?.picks.length) grants.push(grant);
    }
  }
  return grants;
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
  f: DeclarationFields & { name: string; nameDe?: string; desc: string; descDe?: string; key?: string },
  gainedAt: number,
): GainedFeature {
  return {
    name: f.name || f.nameDe || '',
    nameDe: f.nameDe || f.name,
    desc: f.desc || f.descDe || '',
    descDe: f.descDe,
    source: 'feat',
    gainedAt,
    ...declarationOf(f),
    ...(f.key ? { key: f.key } : {}),
  };
}
