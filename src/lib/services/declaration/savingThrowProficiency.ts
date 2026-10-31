/**
 * Rettungswurf-Übung nach Wahl, meist als Ersatz („Übung in WEI, sonst INT oder CHA"). Gefragt
 * wird gegen den Übungsstand VOR dem Merkmal — danach trägt der Bogen die Übung des festen
 * Grants, und die Bedingung wäre immer erfüllt.
 */
import type { AnalysisChoice } from '../analysis/types';
import type { FeatureRider } from '../../schemas/levelUp';
import { ABILITY_KEYS, ABILITY_LABEL_BY_NAME, ABILITY_NAMES, type AbilityName } from '../../schemas/abilities';
import type { Character } from '../../schemas/characterSchema';
import { declaredChoice } from '../declaredChoice';
import { emptyRider } from './rider';
import {
  choiceIdSuffix, declaredChoicesOfKind, featureIdPart, splitChoiceAnswer,
  type DeclaredChoiceRef, type DeclaredChoiceSource,
} from './source';

export const isSavingThrowProficiencyRef = (r: DeclaredChoiceRef): boolean => r.grant.kind === 'savingThrowProficiency';

export const savingThrowProficiencyRefs = <T extends DeclaredChoiceSource>(f: T): DeclaredChoiceRef<T>[] =>
  declaredChoicesOfKind(f, 'savingThrowProficiency');

export const savingThrowProficiencyChoiceId = (r: DeclaredChoiceRef): string =>
  `saveprof_${featureIdPart(r.feature)}${choiceIdSuffix(r.ordinal)}`;

/** Die geübten Rettungswürfe des Bogens als englische SRD-Namen. */
export const sheetSaveProficiencies = (saveProfs: Character['saveProfs'] | undefined): AbilityName[] =>
  ABILITY_KEYS.flatMap((k, i) => (saveProfs?.[k] ? [ABILITY_NAMES[i]] : []));

/** null, solange die Bedingung nicht greift oder nichts mehr zur Wahl steht. */
export function savingThrowProficiencyChoice(
  r: DeclaredChoiceRef,
  proficient: readonly string[],
): AnalysisChoice | null {
  if (!isSavingThrowProficiencyRef(r)) return null;
  const { feature: f, grant } = r;
  if (grant.onlyIfProficient && !proficient.includes(grant.onlyIfProficient)) return null;
  const allowed: readonly AbilityName[] = grant.abilities.length ? grant.abilities : ABILITY_NAMES;
  const options = allowed.filter((a) => !proficient.includes(a));
  if (!options.length) return null;
  const count = Math.min(Math.max(1, grant.count), options.length);
  const nameDe = f.nameDe || f.name;
  const helpDe = grant.onlyIfProficient
    ? `Du bist in Rettungswürfen auf ${ABILITY_LABEL_BY_NAME[grant.onlyIfProficient]} schon geübt.`
    : 'Bereits geübte Rettungswürfe stehen nicht zur Wahl.';
  return {
    ...declaredChoice({ id: savingThrowProficiencyChoiceId(r), feature: f.name, featureDe: nameDe, featureKey: f.key ?? '' }),
    type: count > 1 ? 'multiselect' : 'choice',
    max: count,
    question: `${f.name}: choose ${count} saving throw(s) to gain proficiency in`,
    questionDe: `${nameDe}: Wähle ${count > 1 ? `${count} Rettungswürfe` : 'einen Rettungswurf'}, in dem du Übung erhältst`,
    helpDe,
    options: [...options],
    optionsDe: options.map((a) => ABILITY_LABEL_BY_NAME[a]),
  };
}

export function savingThrowProficiencyChoices(
  features: DeclaredChoiceSource[],
  proficient: readonly string[],
): AnalysisChoice[] {
  return features
    .flatMap((f) => savingThrowProficiencyRefs(f).map((r) => savingThrowProficiencyChoice(r, proficient)))
    .filter((c): c is AnalysisChoice => c !== null);
}

/** Eine Antwort außerhalb der zugelassenen Attribute wird verworfen — geänderte Deklaration. */
export function savingThrowProficiencyRider(r: DeclaredChoiceRef, picked: readonly string[]): FeatureRider | null {
  if (!isSavingThrowProficiencyRef(r)) return null;
  const allowed: readonly string[] = r.grant.abilities.length ? r.grant.abilities : ABILITY_NAMES;
  const saves = picked.filter((p): p is AbilityName => allowed.includes(p));
  if (!saves.length) return null;
  const rider = emptyRider(r.feature);
  return { ...rider, proficiencies: { ...rider.proficiencies, savingThrows: saves } };
}

export function savingThrowProficiencyRiders(
  features: DeclaredChoiceSource[],
  answerOf: (choiceId: string) => string,
): FeatureRider[] {
  return features
    .flatMap((f) =>
      savingThrowProficiencyRefs(f).map((r) =>
        savingThrowProficiencyRider(r, splitChoiceAnswer(answerOf(savingThrowProficiencyChoiceId(r))))))
    .filter((r): r is FeatureRider => r !== null);
}
