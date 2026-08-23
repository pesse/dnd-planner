/**
 * Die Attributserhöhung EINES Merkmals: `grants.abilities` legt sie fest,
 * `grantsChoice.kind === 'abilityIncrease'` stellt das Attribut zur Wahl. Nicht gemeint ist die
 * Erhöhung der Stufentabelle — die fragt der Aufstieg selbst (`asi_ability*`).
 *
 * Anders als jede andere Grant-Art ist das Ziel ADDITIV: die Obergrenze reist deshalb bis zur
 * Senke mit, und die Senke ist beide Male dieselbe Funktion (`abilityIncreasesOf`).
 */
import type { AnalysisChoice } from '../analysis/types';
import type { FeatureRider } from '../../schemas/levelUp';
import type { AbilityGrant } from '../../schemas/grants';
import {
  ABILITY_KEYS, ABILITY_LABEL_BY_NAME, ABILITY_NAMES, abilityKeyOf, abilityRecordOf,
  type AbilityKey, type AbilityName,
} from '../../schemas/abilities';
import { declaredChoice } from '../declaredChoice';
import { emptyRider } from './rider';
import {
  choiceIdSuffix, declaredChoicesOfKind, featureIdPart, splitChoiceAnswer,
  type DeclaredChoiceRef, type DeclaredChoiceSource,
} from './source';

export const isAbilityIncreaseRef = (r: DeclaredChoiceRef): boolean => r.grant.kind === 'abilityIncrease';

export const abilityIncreaseRefs = <T extends DeclaredChoiceSource>(f: T): DeclaredChoiceRef<T>[] =>
  declaredChoicesOfKind(f, 'abilityIncrease');

export const isAbilityIncreaseFeature = (f: DeclaredChoiceSource): boolean => abilityIncreaseRefs(f).length > 0;

export const abilityIncreaseChoiceId = (r: DeclaredChoiceRef): string =>
  `ability_${featureIdPart(r.feature)}${choiceIdSuffix(r.ordinal)}`;

/** Leere Deklaration = alle sechs; ein unbekannter Name fällt weg statt die Liste zu vergiften. */
export function abilityIncreaseOptions(grant: { abilities: readonly string[] }): AbilityName[] {
  const wanted = grant.abilities.filter((a): a is AbilityName => (ABILITY_NAMES as readonly string[]).includes(a));
  return wanted.length ? wanted : [...ABILITY_NAMES];
}

/**
 * Erhöhung und Obergrenze in Rider-Form — EINE Faltung für den festen Grant und die getroffene
 * Wahl, sonst stünde die Deckelung an der einen Form und fehlte an der anderen.
 */
export function abilityRiderFields(
  increases: readonly AbilityGrant[],
): Pick<FeatureRider, 'abilityScoreIncrease' | 'abilityScoreMax'> {
  const abilityScoreIncrease = abilityRecordOf(() => 0);
  const abilityScoreMax = abilityRecordOf(() => 0);
  for (const inc of increases) {
    const key = abilityKeyOf(inc.ability);
    if (!key) continue;
    abilityScoreIncrease[key] += inc.amount;
    abilityScoreMax[key] = Math.max(abilityScoreMax[key], inc.max);
  }
  return { abilityScoreIncrease, abilityScoreMax };
}

/**
 * `count > 1` fragt nach VERSCHIEDENEN Attributen. Zweimal dasselbe („+2 auf eins") ist eine
 * zweite Wahl am selben Merkmal, keine doppelte Antwort auf dieselbe.
 */
export function abilityIncreaseChoice(r: DeclaredChoiceRef): AnalysisChoice | null {
  if (!isAbilityIncreaseRef(r)) return null;
  const { feature: f, grant } = r;
  const options = abilityIncreaseOptions(grant);
  const count = Math.min(Math.max(1, grant.count), options.length);
  const nameDe = f.nameDe || f.name;
  return {
    ...declaredChoice({ id: abilityIncreaseChoiceId(r), feature: f.name, featureDe: nameDe, featureKey: f.key ?? '' }),
    type: count > 1 ? 'multiselect' : 'choice',
    max: count,
    question: `${f.name}: choose ${count} ability score(s) to increase by 1`,
    questionDe: count > 1 ? `${nameDe}: Wähle ${count} Attribute (je +1)` : `${nameDe}: Wähle ein Attribut (+1)`,
    helpDe: `Additiv auf den Bogenwert, höchstens ${grant.abilityMax}.`,
    options,
    optionsDe: options.map((a) => ABILITY_LABEL_BY_NAME[a]),
  };
}

export function abilityIncreaseChoices(features: DeclaredChoiceSource[]): AnalysisChoice[] {
  return features
    .flatMap((f) => abilityIncreaseRefs(f).map(abilityIncreaseChoice))
    .filter((c): c is AnalysisChoice => c !== null);
}

/** Eine Antwort außerhalb der zugelassenen Attribute wird verworfen — geänderte Deklaration. */
export function abilityIncreaseRider(r: DeclaredChoiceRef, picked: readonly string[]): FeatureRider | null {
  if (!isAbilityIncreaseRef(r)) return null;
  const allowed = abilityIncreaseOptions(r.grant);
  const chosen = picked
    .map((p) => p.trim())
    .filter((p): p is AbilityName => (allowed as readonly string[]).includes(p));
  if (!chosen.length) return null;
  const grants = chosen.map((ability) => ({ ability, amount: 1, max: r.grant.abilityMax }));
  return { ...emptyRider(r.feature), ...abilityRiderFields(grants) };
}

export function abilityIncreaseRiders(
  features: DeclaredChoiceSource[],
  answerOf: (choiceId: string) => string,
): FeatureRider[] {
  return features
    .flatMap((f) =>
      abilityIncreaseRefs(f).map((r) =>
        abilityIncreaseRider(r, splitChoiceAnswer(answerOf(abilityIncreaseChoiceId(r))))))
    .filter((r): r is FeatureRider => r !== null);
}

export interface RiderAbilityIncrease {
  ability: AbilityKey;
  value: number;
  /** 0 = das Merkmal nennt keine Obergrenze. */
  max: number;
  featureKey: string;
}

/**
 * JE MERKMAL eine Erhöhung, nicht die Summe: die Obergrenze hängt am Merkmal, und summiert
 * müsste eine der beiden gelten (Ringer 20 neben einem Epischen Segen 30).
 */
export function abilityIncreasesOf(riders: readonly FeatureRider[]): RiderAbilityIncrease[] {
  const out: RiderAbilityIncrease[] = [];
  for (const r of riders)
    for (const ability of ABILITY_KEYS) {
      const value = r.abilityScoreIncrease[ability] ?? 0;
      if (!value) continue;
      out.push({ ability, value, max: r.abilityScoreMax[ability] ?? 0, featureKey: r.featureKey });
    }
  return out;
}

/** Ein bereits höherer Bestand sinkt nie — die Grenze deckelt die Erhöhung, nicht den Bogen. */
export const cappedScore = (base: number, value: number, max?: number): number =>
  max ? Math.min(base + value, Math.max(base, max)) : base + value;
