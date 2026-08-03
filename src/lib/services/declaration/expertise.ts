/**
 * Expertise — der einzige `grantsChoice.kind`, dessen Optionen NICHT im Vault stehen können:
 * die Liste ist der Übungsstand DIESES Charakters, deklariert wird nur die Anzahl. Die KI
 * kennt ihn nicht (`buildFeatureEffectsInput` schickt keine Charakter-Zusammenfassung mit).
 */
import type { AnalysisChoice } from '../analysis/types';
import type { FeatureRider } from '../../schemas/levelUp';
import { declaredChoice } from '../declaredChoice';
import { SKILL_NAMES, type SkillName } from '../../schemas/vocabulary';
import type { FeatureChoiceGrant } from '../../schemas/featureChoice';
import { skillLabelDe } from '../proficiencyGrants';
import { emptyRider } from './rider';
import type { Declared, DeclaredChoiceSource } from './source';

export function isExpertiseFeature(f: DeclaredChoiceSource): f is Declared {
  return f.grantsChoice?.kind === 'expertise';
}

export const expertiseChoiceId = (f: DeclaredChoiceSource): string =>
  `expertise_${(f.key || f.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

/**
 * Ohne geübte Fertigkeit gar keine Wahl statt einer leeren Liste — eine unbeantwortbare Frage
 * würde den Checkpoint blockieren. `already` fällt heraus, weil Expertise nicht stapelbar ist.
 */
export function expertiseChoice(
  f: DeclaredChoiceSource,
  proficient: readonly string[],
  already: readonly string[] = [],
): AnalysisChoice | null {
  if (!isExpertiseFeature(f)) return null;
  const taken = new Set(already);
  const options = proficient.filter((s) => !taken.has(s));
  if (!options.length) return null;
  const count = Math.max(1, f.grantsChoice.count);
  const nameDe = f.nameDe || f.name;
  return {
    ...declaredChoice({ id: expertiseChoiceId(f), feature: f.name, featureDe: nameDe, featureKey: f.key ?? '' }),
    type: 'multiselect',
    max: Math.min(count, options.length),
    question: `${f.name}: choose ${count} of your skill proficiencies`,
    questionDe: `${nameDe}: Wähle ${count} deiner geübten Fertigkeiten`,
    helpDe: 'Der Übungsbonus zählt in diesen Fertigkeiten doppelt.',
    options: [...options],
    optionsDe: options.map(skillLabelDe),
  };
}

/** Rider der getroffenen Expertise-Wahl (englische SRD-Namen — das Vokabular des Riders). */
export function expertiseRider(f: DeclaredChoiceSource, picked: readonly string[]): FeatureRider | null {
  const skills = picked.filter((s): s is SkillName => (SKILL_NAMES as readonly string[]).includes(s));
  if (!isExpertiseFeature(f) || !skills.length) return null;
  return { ...emptyRider(f), expertiseSkills: [...skills] };
}
