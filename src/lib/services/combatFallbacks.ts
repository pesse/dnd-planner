/**
 * Gerechnete Kampfwerte für leere Felder. Bogen, Druck und KI-Kontext zeigen sie über
 * `withCombatFallbacks`; in die Datei kommen sie nie.
 */
import type { Character, CharacterClass } from '../schemas/characterSchema';
import { totalLevel } from '../schemas/classLevelText';
import { abilityRecordOf, type AbilityScores } from '../schemas/abilities';
import type { FeatureGrant } from '../schemas/grants';
import { mod } from '../domain/skills';
import { armorClassDerivation, type ArmorClassFeature } from './armorClass';
import { declaredSpeed } from './characterProperties';
import { proficiencyBonus } from './classProgression';
import { effectiveScores, loadWornAbilityEffects } from './effectiveAbilities';
import { loadSavingThrowInputs } from './savingThrows';
import type { IdleItem, WornItem } from './wornItems';

export interface CombatFallbacks {
  /** null, solange Bibliotheken und Merkmale laden. */
  ac: number | null;
  /** '' ohne Deklaration oder solange die Merkmale laden. */
  speed: string;
  /** Das Merkmal, das die Bewegungsrate festlegt, samt Fußangabe. */
  speedSource: { labelDe: string; feet: number } | null;
  level: number;
  proficiencyBonus: number;
}

export function combatFallbacks(
  classes: readonly CharacterClass[],
  acTotal: number | null,
  features: readonly { name: string; grants?: FeatureGrant }[] | null,
): CombatFallbacks {
  const speed = features ? declaredSpeed(features) : null;
  const level = totalLevel([...classes]);
  return {
    ac: acTotal,
    speed: speed?.meters ?? '',
    speedSource: speed && { labelDe: speed.labelDe, feet: speed.feet },
    level,
    proficiencyBonus: proficiencyBonus(level),
  };
}

/** Für Aufrufer, die Inventar und Merkmale schon geladen haben (Druck). */
export function combatFallbacksFrom(
  c: Pick<Character, 'ac' | 'classes'>,
  loaded: { worn: readonly WornItem[]; idle: readonly IdleItem[]; features: readonly ArmorClassFeature[] },
  scores: AbilityScores,
): CombatFallbacks {
  const ac = armorClassDerivation({ ac: c.ac, ...loaded, mods: abilityRecordOf((k) => mod(scores[k])) });
  return combatFallbacks(c.classes, ac.total, loaded.features);
}

export async function loadCombatFallbacks(c: Character): Promise<CombatFallbacks> {
  const [loaded, effects] = await Promise.all([loadSavingThrowInputs(c), loadWornAbilityEffects(c.inventory ?? [])]);
  return combatFallbacksFrom(c, loaded, effectiveScores(c.abilities, effects));
}

export function withCombatFallbacks(c: Character, fb: CombatFallbacks): Character {
  return {
    ...c,
    ac: c.ac.trim() || (fb.ac === null ? '' : String(fb.ac)),
    speed: c.speed.trim() || fb.speed,
    hpCurrent: c.hpCurrent.trim() || c.hpMax,
    proficiencyBonus: c.proficiencyBonus ?? fb.proficiencyBonus,
  };
}
