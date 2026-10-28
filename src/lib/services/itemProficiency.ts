/**
 * Übung mit einem einzelnen Gegenstand für den Gegenstands-Tooltip: Waffen über
 * `isProficientWithWeapon`, Rüstung und Schild über die Häkchen aus `PROFICIENCY_DEFS`.
 */
import { PROFICIENCY_FLAGS } from '../domain/proficiencies';
import type { ProficiencyFlags } from '../schemas/characterSchema';
import type { ArmorTraining } from '../schemas/vocabulary';
import type { ItemInfo } from '../itemLibrary';
import { armorDexBonus } from './armorClass';
import { isProficientWithWeapon, type WeaponLike } from './weaponProficiency';

export type TrainingItem = WeaponLike & Pick<ItemInfo, 'armor_category' | 'armor_class'>;

export interface ItemTrainingNote {
  proficient: boolean;
  /** Was fehlende Übung kostet; nur ohne Übung gesetzt. */
  untrainedDe?: string;
  /** Nur bei Körperrüstung: was GES zur RK beiträgt, null wo GES nicht zählt. */
  dexBonus?: number | null;
}

const ARMOR_TRAINING: Record<string, ArmorTraining> = {
  Light: 'Light', Medium: 'Medium', Heavy: 'Heavy', Shield: 'Shields',
};

/** undefined, wo der Gegenstand keine Übung kennt oder seine Kategorie nicht nennt. */
export function itemTraining(
  item: TrainingItem,
  prof: ProficiencyFlags,
  byName?: (name: string) => { index?: string } | undefined,
): boolean | undefined {
  if (item.weapon_category === 'Simple' || item.weapon_category === 'Martial')
    return isProficientWithWeapon(prof, item, byName);
  const training = ARMOR_TRAINING[item.armor_category ?? ''];
  const flag = PROFICIENCY_FLAGS.find((f) => f.def.kind === 'armor' && f.def.value === training);
  return flag && prof[flag.field];
}

const UNTRAINED_DE = {
  weapon: 'kein Übungsbonus auf den Angriff',
  armor: 'Nachteil auf Stärke- und Geschicklichkeitswürfe, kein Zauberwirken',
  shield: 'kein RK-Bonus durch den Schild',
};

export function itemTrainingNote(
  item: TrainingItem,
  prof: ProficiencyFlags,
  dexMod: number,
  byName?: (name: string) => { index?: string } | undefined,
): ItemTrainingNote | undefined {
  const proficient = itemTraining(item, prof, byName);
  if (proficient === undefined) return undefined;
  const kind = item.weapon_category ? 'weapon' : item.armor_category === 'Shield' ? 'shield' : 'armor';
  const note: ItemTrainingNote = { proficient };
  if (!proficient) note.untrainedDe = UNTRAINED_DE[kind];
  if (kind === 'armor') note.dexBonus = armorDexBonus(item, dexMod);
  return note;
}
