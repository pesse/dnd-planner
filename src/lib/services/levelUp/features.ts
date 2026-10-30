/**
 * Neu gewonnene Merkmale und Talente auf `GainedFeature` normalisiert — die Einheit, in der
 * Deutungs- und Deklarations-Strecke beide lesen.
 */
import { getProgressionByKey } from '../classProgression';
import { isFlowOwnedChoiceFeature, type LevelUpDelta } from '../levelUp';
import { quotaBranches, withoutDeclaredChoiceFeatures, type DeclaredChoiceSource } from '../declaration/optionList';
import { isSpellAccessFeature } from '../declaration/casting';
import { declarationOf, type DeclarationFields } from '../declaredFeature';
import { withoutSpellGrantFeatures, type SpellGrantSource } from '../grantedSpells';
import { spellAccessGrantOf, type SpellAccessGrant } from '../spellcasting/access';
import type { ClassFeature } from '../../schemas/classProgression';
import type { CharacterSpecies } from '../../schemas/characterSchema';
import type { Trait } from '../../schemas/species';
import { getSpeciesByKey } from '../../speciesLibrary';
import { traitsBetween } from '../traitLevel';
import { withoutSheetValueTraits } from '../sheetValueTraits';
import type { GainedFeature } from '../analysis/types';
import type { FeatCategory } from '../../schemas/vocabulary';

/** Englisch geführt, deutsche Fassung als Beilage. */
export interface ChosenFeat extends DeclarationFields {
  key: string;
  name: string;
  nameDe: string;
  gainedAt: number;
  desc: string;
  descDe?: string;
  /** Gewählt in eine bedingte Talentwahl dieser Kategorie — sonst zählt es zu den freien. */
  slot?: FeatCategory;
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
 * Die Merkmalsstrecke der SUBKLASSEN-Merkmale, eine Regel für beide Aufrufer: deklarierte Wahlen,
 * deklariertes Zauberwirken und immer-vorbereitete Zauberlisten fliegen raus — die drei
 * beantworten eigene Flow-Schritte aus der Bibliothek.
 * Klassenmerkmale deckt `isFlowOwnedChoiceFeature` ab, das hier nicht laufen darf: seine
 * Namens-Fallbacks („Spellcasting") treffen an der Subklasse echte Mechanik.
 */
export function subclassFeaturesForFlow<T extends DeclaredChoiceSource & SpellGrantSource>(features: T[]): T[] {
  return withoutDeclaredChoiceFeatures(withoutSpellGrantFeatures(features));
}

/**
 * Was hier herausfliegt, fliegt aus der Merkmalsstrecke:
 * - flow-eigene Wahlen (Subklasse, Attributsverbesserung) — die Analyse stellte sie sonst
 *   ein zweites Mal;
 * - immer-vorbereitete Zauberlisten, auch bei SUBKLASSEN-Merkmalen — sie werden aus der
 *   Tabelle im Merkmalstext deterministisch gelesen (`declaredSpellGrants`).
 */
export function gainedFeaturesFor(delta: LevelUpDelta): GainedFeature[] {
  return [
    ...withoutSpellGrantFeatures(delta.featuresGained.filter((f) => !isFlowOwnedChoiceFeature(f)))
      .map((f) => featureToGained(f, 'class', delta.fromLevel, delta.toLevel)),
    ...subclassFeaturesForFlow(delta.subclassFeaturesGained)
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
      if (!f.gainedAt.some((l) => l <= delta.toLevel)) continue;
      const gainedAt = Math.min(...f.gainedAt);
      // Erst in dieser Spanne gewonnen: alles ist Zuwachs, die Ausgangsstufe hatte nichts.
      const fromLevel = gainedAt <= delta.fromLevel ? delta.fromLevel : undefined;
      const place = { level: delta.toLevel, fromLevel, gainedAt };
      // Die Zweigwahl wird nur im Aufstieg gefragt, der das Merkmal bringt — danach gibt es
      // keine Antwort, gegen die ein `when.option`-Kontingent prüfen könnte.
      const branches = isSpellAccessFeature(f) ? [''] : fromLevel === undefined ? quotaBranches(f) : [];
      for (const branch of branches) {
        const grant = spellAccessGrantOf({ ...f, key: f.key }, branch ? { ...place, branch } : place);
        if (grant?.picks.length) grants.push(grant);
      }
    }
  }
  return grants;
}

/**
 * Subklassen-Merkmale NACH der Wahl nachladen, VOLLSTÄNDIG: der Aufrufer braucht sie so für
 * Info-Einträge und deklarierte Wahlen und siebt für die Merkmalsstrecke selbst.
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

/** Volk und Unter-Volk, halboffen `(fromCharLevel, toCharLevel]` — CHARAKTER-, nicht Klassenstufe. */
export async function speciesTraitsGained(
  species: CharacterSpecies | undefined,
  fromCharLevel: number,
  toCharLevel: number,
): Promise<Trait[]> {
  const keys = [species?.sourceKey, species?.subspeciesKey].filter((k): k is string => !!k?.trim());
  const specs = await Promise.all(keys.map((k) => getSpeciesByKey(k)));
  return specs.flatMap((spec) => (spec ? traitsBetween(spec.traits, fromCharLevel, toCharLevel) : []));
}

/**
 * Der Notiz-Eingang der Speziesmerkmale: ohne Bogenwerte und ohne deklarierte Wahlen — wie
 * im Wizard, dessen Volksmerkmale-Text dieselben Merkmale auslässt.
 */
export function speciesNoteFeatures(traits: readonly Trait[]): GainedFeature[] {
  return withoutDeclaredChoiceFeatures(withoutSheetValueTraits([...traits])).map((t) => ({
    name: t.name || t.nameDe || '',
    nameDe: t.nameDe || t.name,
    desc: t.desc || t.descDe || '',
    descDe: t.descDe,
    source: 'species',
    key: t.key,
    gainedAt: t.gainedAt ?? 1,
    ...declarationOf(t),
  }));
}
