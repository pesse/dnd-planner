/**
 * Fertigkeitsübung nach Wahl — der Gegenschnitt zu `expertise.ts`: gewählt wird aus den NICHT
 * geübten Fertigkeiten. Die zweite Form derselben Sache, `grants.proficiencies.skills.choose`,
 * hat eine ANDERE Senke (`collectGrants`, nur im Wizard) und lässt das Merkmal in der KI-Deutung.
 */
import type { AnalysisChoice } from '../analysis/types';
import type { FeatureRider } from '../../schemas/levelUp';
import { declaredChoice } from '../declaredChoice';
import { SKILL_NAMES, type SkillName } from '../../schemas/vocabulary';
import { skillLabelDe } from '../proficiencyGrants';
import { emptyRider } from './rider';
import {
  choiceIdSuffix, declaredChoicesOfKind, featureIdPart, splitChoiceAnswer,
  type DeclaredChoiceRef, type DeclaredChoiceSource,
} from './source';

export const isSkillProficiencyRef = (r: DeclaredChoiceRef): boolean => r.grant.kind === 'skillProficiency';

export const skillProficiencyRefs = <T extends DeclaredChoiceSource>(f: T): DeclaredChoiceRef<T>[] =>
  declaredChoicesOfKind(f, 'skillProficiency');

export const isSkillProficiencyFeature = (f: DeclaredChoiceSource): boolean =>
  skillProficiencyRefs(f).length > 0;

export const skillProficiencyChoiceId = (r: DeclaredChoiceRef): string =>
  `skillprof_${featureIdPart(r.feature)}${choiceIdSuffix(r.ordinal)}`;

/**
 * `proficient` fällt heraus — eine zweite Übung gewährt nichts. `keep` ist die schon getroffene
 * Antwort: angewendet steht sie in `proficient` und fiele sonst aus ihren eigenen Optionen.
 */
export function skillProficiencyChoice(
  r: DeclaredChoiceRef,
  proficient: readonly string[],
  keep: readonly string[] = [],
): AnalysisChoice | null {
  if (!isSkillProficiencyRef(r)) return null;
  const f = r.feature;
  const allowed: readonly string[] = r.grant.skills.length ? r.grant.skills : SKILL_NAMES;
  const kept = new Set(keep);
  const taken = new Set(proficient.filter((s) => !kept.has(s)));
  const options = allowed.filter((s) => !taken.has(s));
  if (!options.length) return null;
  const count = Math.max(1, r.grant.count);
  const nameDe = f.nameDe || f.name;
  return {
    ...declaredChoice({ id: skillProficiencyChoiceId(r), feature: f.name, featureDe: nameDe, featureKey: f.key ?? '' }),
    type: 'multiselect',
    max: Math.min(count, options.length),
    question: `${f.name}: choose ${count} skill(s) to gain proficiency in`,
    questionDe: `${nameDe}: Wähle ${count} Fertigkeit(en), in denen du Übung erhältst`,
    helpDe: 'Bereits geübte Fertigkeiten stehen nicht zur Wahl.',
    options: [...options],
    optionsDe: options.map(skillLabelDe),
  };
}

export function skillProficiencyChoices(
  features: DeclaredChoiceSource[],
  proficient: readonly string[],
): AnalysisChoice[] {
  return features
    .flatMap((f) => skillProficiencyRefs(f).map((r) => skillProficiencyChoice(r, proficient)))
    .filter((c): c is AnalysisChoice => c !== null);
}

/** Übung reist in `proficiencies.skills`, nicht in `expertiseSkills` — anderes Bogen-Flag. */
export function skillProficiencyRider(r: DeclaredChoiceRef, picked: readonly string[]): FeatureRider | null {
  const skills = picked.filter((s): s is SkillName => (SKILL_NAMES as readonly string[]).includes(s));
  if (!isSkillProficiencyRef(r) || !skills.length) return null;
  const rider = emptyRider(r.feature);
  return { ...rider, proficiencies: { ...rider.proficiencies, skills: [...skills] } };
}

export function skillProficiencyRiders(
  features: DeclaredChoiceSource[],
  answerOf: (choiceId: string) => string,
): FeatureRider[] {
  return features
    .flatMap((f) =>
      skillProficiencyRefs(f).map((r) =>
        skillProficiencyRider(r, splitChoiceAnswer(answerOf(skillProficiencyChoiceId(r))))))
    .filter((r): r is FeatureRider => r !== null);
}
