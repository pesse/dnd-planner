/**
 * Expertise — der einzige `grantsChoice.kind`, dessen Optionen NICHT im Vault stehen können:
 * die Liste ist der Übungsstand DIESES Charakters, deklariert wird nur die Anzahl. Die KI
 * kennt ihn nicht (`buildFeatureEffectsInput` schickt keine Charakter-Zusammenfassung mit).
 */
import type { AnalysisChoice } from '../analysis/types';
import type { FeatureRider } from '../../schemas/levelUp';
import { declaredChoice } from '../declaredChoice';
import { SKILL_NAMES, type SkillName } from '../../schemas/vocabulary';
import { skillLabelDe } from '../proficiencyGrants';
import { emptyRider } from './rider';
import {
  choiceIdSuffix, declaredChoicesOfKind, featureIdPart, type DeclaredChoiceRef, type DeclaredChoiceSource,
} from './source';

export const isExpertiseRef = (r: DeclaredChoiceRef): boolean => r.grant.kind === 'expertise';

export const expertiseRefs = <T extends DeclaredChoiceSource>(f: T): DeclaredChoiceRef<T>[] =>
  declaredChoicesOfKind(f, 'expertise');

export const isExpertiseFeature = (f: DeclaredChoiceSource): boolean => expertiseRefs(f).length > 0;

export const expertiseChoiceId = (r: DeclaredChoiceRef): string =>
  `expertise_${featureIdPart(r.feature)}${choiceIdSuffix(r.ordinal)}`;

/**
 * Ohne geübte Fertigkeit gar keine Wahl statt einer leeren Liste — eine unbeantwortbare Frage
 * würde den Checkpoint blockieren. `already` fällt heraus, weil Expertise nicht stapelbar ist.
 */
export function expertiseChoice(
  r: DeclaredChoiceRef,
  proficient: readonly string[],
  already: readonly string[] = [],
): AnalysisChoice | null {
  if (!isExpertiseRef(r)) return null;
  const f = r.feature;
  const taken = new Set(already);
  const options = proficient.filter((s) => !taken.has(s));
  if (!options.length) return null;
  const count = Math.max(1, r.grant.count);
  const nameDe = f.nameDe || f.name;
  return {
    ...declaredChoice({ id: expertiseChoiceId(r), feature: f.name, featureDe: nameDe, featureKey: f.key ?? '' }),
    type: 'multiselect',
    max: Math.min(count, options.length),
    question: `${f.name}: choose ${count} of your skill proficiencies`,
    questionDe: `${nameDe}: Wähle ${count} deiner geübten Fertigkeiten`,
    helpDe: 'Der Übungsbonus zählt in diesen Fertigkeiten doppelt.',
    options: [...options],
    optionsDe: options.map(skillLabelDe),
  };
}

export function expertiseChoices(
  features: DeclaredChoiceSource[],
  proficient: readonly string[],
  already: readonly string[] = [],
): AnalysisChoice[] {
  return features
    .flatMap((f) => expertiseRefs(f).map((r) => expertiseChoice(r, proficient, already)))
    .filter((c): c is AnalysisChoice => c !== null);
}

/** Rider der getroffenen Expertise-Wahl (englische SRD-Namen — das Vokabular des Riders). */
export function expertiseRider(r: DeclaredChoiceRef, picked: readonly string[]): FeatureRider | null {
  const skills = picked.filter((s): s is SkillName => (SKILL_NAMES as readonly string[]).includes(s));
  if (!isExpertiseRef(r) || !skills.length) return null;
  return { ...emptyRider(r.feature), expertiseSkills: [...skills] };
}

const splitAnswer = (answer: string): string[] => answer.split(',').map((s) => s.trim());

export function expertiseRiders(
  features: DeclaredChoiceSource[],
  answerOf: (choiceId: string) => string,
): FeatureRider[] {
  return features
    .flatMap((f) => expertiseRefs(f).map((r) => expertiseRider(r, splitAnswer(answerOf(expertiseChoiceId(r))))))
    .filter((r): r is FeatureRider => r !== null);
}
