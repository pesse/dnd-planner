/**
 * Werte, die der Character-Service nicht fertig liefert, aus Grundwerten und Modifikatoren —
 * nach demselben Rechenweg wie der Bogen von D&D Beyond, ohne Sonderfälle einzelner Merkmale.
 */
import type { DdbCharacterJson, DdbModifier } from '$lib/schemas/ddbCharacterJson';
import { ABILITY_KEYS, ABILITY_NAMES, type AbilityKey, type AbilityScores } from '$lib/schemas/abilities';
import { SKILL_NAMES, type SkillName } from '$lib/schemas/vocabulary';
import { SKILL_DEFS, mod } from '$lib/domain/skills';

const ARMOR_LIGHT = 1;
const ARMOR_MEDIUM = 2;
const ARMOR_SHIELD = 4;

/** `Sleight of Hand` → `sleight-of-hand`, `Strength` → `strength` */
export const slug = (s: string): string => s.toLowerCase().replace(/\s+/g, '-');

/** Gegenstands-Modifikatoren wirken nur ausgerüstet und, falls nötig, eingestimmt. */
export function activeModifiers(d: DdbCharacterJson): DdbModifier[] {
  const m = d.modifiers;
  if (!m) return [];
  const active = new Set(
    d.inventory
      .filter((i) => i.equipped && (!i.definition.canAttune || i.isAttuned))
      .map((i) => i.definition.id),
  );
  return [
    ...m.race, ...m.class, ...m.background, ...m.feat, ...m.condition,
    ...m.item.filter((x) => active.has(x.componentId)),
  ];
}

export const ofType = (mods: DdbModifier[], type: string, subType?: string): DdbModifier[] =>
  mods.filter((x) => x.type === type && (subType === undefined || x.subType === subType));

const sum = (mods: DdbModifier[], type: string, subType: string): number =>
  ofType(mods, type, subType).reduce((n, x) => n + (x.value ?? 0), 0);

const statValue = (stats: DdbCharacterJson['stats'], i: number): number | null =>
  stats.find((s) => s.id === i + 1)?.value ?? null;

export function abilityScores(d: DdbCharacterJson, mods: DdbModifier[]): AbilityScores {
  const out = {} as AbilityScores;
  ABILITY_KEYS.forEach((k, i) => {
    const override = statValue(d.overrideStats, i);
    const sub = `${slug(ABILITY_NAMES[i])}-score`;
    const raised = (statValue(d.stats, i) ?? 10) + (statValue(d.bonusStats, i) ?? 0) + sum(mods, 'bonus', sub);
    const set = Math.max(0, ...ofType(mods, 'set', sub).map((x) => x.value ?? 0));
    out[k] = override ?? Math.max(raised, set);
  });
  return out;
}

export const totalLevel = (d: DdbCharacterJson): number => d.classes.reduce((n, c) => n + c.level, 0);

export const proficiencyBonus = (level: number): number => Math.ceil(Math.max(level, 1) / 4) + 1;

export function savingThrowProfs(mods: DdbModifier[]): Record<AbilityKey, boolean> {
  const out = {} as Record<AbilityKey, boolean>;
  ABILITY_KEYS.forEach((k, i) => {
    out[k] = ofType(mods, 'proficiency', `${slug(ABILITY_NAMES[i])}-saving-throws`).length > 0;
  });
  return out;
}

const ATTR_OF = new Map<SkillName, AbilityKey>(SKILL_DEFS.map((s) => [s.en, s.attr as AbilityKey]));

export interface DerivedSkill { name: SkillName; value: number; mark: '' | 'P' | 'E' | 'H' }

export function skills(mods: DdbModifier[], scores: AbilityScores, pb: number): DerivedSkill[] {
  const halfAll = ofType(mods, 'half-proficiency', 'ability-checks').length > 0;
  return SKILL_NAMES.map((name) => {
    const s = slug(name);
    const mark: DerivedSkill['mark'] = ofType(mods, 'expertise', s).length ? 'E'
      : ofType(mods, 'proficiency', s).length ? 'P'
      : halfAll || ofType(mods, 'half-proficiency', s).length ? 'H' : '';
    const prof = mark === 'E' ? 2 * pb : mark === 'P' ? pb : mark === 'H' ? Math.floor(pb / 2) : 0;
    const value = mod(scores[ATTR_OF.get(name) ?? 'str']) + prof + sum(mods, 'bonus', s) + sum(mods, 'bonus', 'ability-checks');
    return { name, value, mark };
  });
}

export function armorClass(d: DdbCharacterJson, mods: DdbModifier[], scores: AbilityScores): number {
  const dex = mod(scores.dex);
  const worn = d.inventory.filter((i) => i.equipped);
  const shield = Math.max(0, ...worn.filter((i) => i.definition.armorTypeId === ARMOR_SHIELD).map((i) => i.definition.armorClass ?? 0));
  const armor = worn.filter((i) => i.definition.filterType === 'Armor' && i.definition.armorTypeId !== ARMOR_SHIELD);
  let base = 10 + dex;
  if (armor.length) {
    base = Math.max(...armor.map((i) => {
      const t = i.definition.armorTypeId;
      return (i.definition.armorClass ?? 0) + (t === ARMOR_LIGHT ? dex : t === ARMOR_MEDIUM ? Math.min(dex, 2) : 0);
    }));
  } else {
    for (const u of ofType(mods, 'set', 'unarmored-armor-class')) {
      const stat = u.statId ? ABILITY_KEYS[u.statId - 1] : undefined;
      base = Math.max(base, 10 + dex + (stat ? mod(scores[stat]) : 0) + (u.value ?? 0));
    }
  }
  return base + shield + sum(mods, 'bonus', 'armor-class');
}

export function maxHitPoints(d: DdbCharacterJson, mods: DdbModifier[], scores: AbilityScores): number {
  if (d.overrideHitPoints) return d.overrideHitPoints;
  const level = totalLevel(d);
  return (d.baseHitPoints ?? 0) + level * (mod(scores.con) + sum(mods, 'bonus', 'hit-points-per-level')) + (d.bonusHitPoints ?? 0);
}

export const initiative = (mods: DdbModifier[], scores: AbilityScores): number =>
  mod(scores.dex) + sum(mods, 'bonus', 'initiative');

export const walkSpeedFt = (d: DdbCharacterJson, mods: DdbModifier[]): number =>
  (d.race?.weightSpeeds?.normal?.walk ?? 30) + sum(mods, 'bonus', 'speed') + sum(mods, 'bonus', 'speed-walking');

export const passiveBonus = (mods: DdbModifier[]): number => sum(mods, 'bonus', 'passive-perception');
