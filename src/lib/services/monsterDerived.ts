/**
 * Was am Monster gerechnet statt gespeichert wird. Open5e liefert `modifiers`,
 * `*_all` und `passive_perception` mit; gespeichert würden sie beim ersten Editieren
 * gegen die Attributswerte driften.
 */
import { abilityRecordOf, type AbilityKey } from '../schemas/abilities';
import { SKILL_DEFS, mod } from '../domain/skills';
import type { SkillName } from '../schemas/vocabulary';
import type { Monster } from '../schemas/monster';

const SKILL_ATTR = new Map<SkillName, AbilityKey>(SKILL_DEFS.map((d) => [d.en, d.attr]));

/** SRD-Tabelle: HG 0–4 → +2, danach je vier Stufen einer mehr. */
export function proficiencyBonus(challengeRating: number): number {
  return 2 + Math.max(0, Math.ceil((challengeRating - 4) / 4));
}

export const abilityMods = (m: Monster): Record<AbilityKey, number> =>
  abilityRecordOf((k) => mod(m.ability_scores[k]));

/** Geübter Rettungswurf, sonst der reine Attributsmodifikator. */
export const saveBonus = (m: Monster, key: AbilityKey): number =>
  m.saving_throws[key] ?? mod(m.ability_scores[key]);

export const skillBonus = (m: Monster, skill: SkillName): number =>
  m.skill_bonuses[skill] ?? mod(m.ability_scores[SKILL_ATTR.get(skill) ?? 'dex']);

export const passivePerception = (m: Monster): number => 10 + skillBonus(m, 'Perception');

export const initiativeBonus = (m: Monster): number => mod(m.ability_scores.dex);
