/**
 * Gerechnete Kampfwerte für leere Felder. Bogen, Druck und KI-Kontext zeigen sie über
 * `withCombatFallbacks`; in die Datei kommen sie nie.
 */
import type { Character, CharacterClass } from '../schemas/characterSchema';
import { totalLevel } from '../schemas/classLevelText';
import { abilityRecordOf, type AbilityScores } from '../schemas/abilities';
import type { FeatureGrant } from '../schemas/grants';
import type { InitiativeEffect } from '../schemas/initiative';
import { mod } from '../domain/skills';
import { armorClassDerivation, type ArmorClassFeature } from './armorClass';
import { declaredSpeed } from './characterProperties';
import { effectiveProficiencyBonus } from './classProgression';
import { sign } from '../utils/num';
import { featureIdOf } from '../utils/text';
import { effectiveScores, loadWornAbilityEffects } from './effectiveAbilities';
import { loadSavingThrowInputs, resolveSaveBonus } from './savingThrows';
import type { IdleItem, WornItem } from './wornItems';

export interface CombatFallbacks {
  /** null, solange Bibliotheken und Merkmale laden. */
  ac: number | null;
  /** '' ohne Deklaration oder solange die Merkmale laden. */
  speed: string;
  /** Das Merkmal, das die Bewegungsrate festlegt, samt Fußangabe. */
  speedSource: { labelDe: string; feet: number } | null;
  level: number;
  /** Aus der Stufe, unabhängig vom eingetragenen Wert. */
  proficiencyBonus: number;
  /** Mit Vorzeichen, wie `character.initiative` ihn führt. */
  initiative: string;
  initiativeRows: { labelDe: string; value: number }[];
  /** Die Merkmale, die Vorteil auf Initiative geben. */
  initiativeAdvantage: string[];
}

type FallbackFeature = { key?: string; name: string; grants?: FeatureGrant };

function initiativeEffects(features: readonly FallbackFeature[]): { labelDe: string; effect: InitiativeEffect }[] {
  const seen = new Set<string>();
  return features.flatMap((f) => {
    const id = featureIdOf(f);
    if (seen.has(id)) return [];
    seen.add(id);
    return (f.grants?.initiative ?? []).map((effect) => ({ labelDe: f.name, effect }));
  });
}

export function combatFallbacks(input: {
  classes: readonly CharacterClass[];
  /** Der eingetragene; ein Initiative-Zuschlag addiert den wirksamen. */
  proficiencyBonus?: number | null;
  acTotal: number | null;
  /** null, solange die Merkmale laden. */
  features: readonly FallbackFeature[] | null;
  /** Wirksame Modifikatoren, samt Gegenständen. */
  mods: AbilityScores;
}): CombatFallbacks {
  const classes = [...input.classes];
  const speed = input.features ? declaredSpeed(input.features) : null;
  const level = totalLevel(classes);
  const effects = initiativeEffects(input.features ?? []);
  const profBonus = effectiveProficiencyBonus({ ...input, classes });
  const initiativeRows = [
    { labelDe: 'GES', value: input.mods.dex },
    ...effects.flatMap(({ labelDe, effect }) =>
      effect.kind === 'bonus' ? [{ labelDe, value: resolveSaveBonus(effect.value, input.mods, profBonus) }] : []),
  ];
  return {
    ac: input.acTotal,
    speed: speed?.meters ?? '',
    speedSource: speed && { labelDe: speed.labelDe, feet: speed.feet },
    level,
    proficiencyBonus: effectiveProficiencyBonus({ classes }),
    initiative: sign(initiativeRows.reduce((n, r) => n + r.value, 0)),
    initiativeRows,
    initiativeAdvantage: effects.flatMap(({ labelDe, effect }) => effect.kind === 'advantage' ? [labelDe] : []),
  };
}

/** Für Aufrufer, die Inventar und Merkmale schon geladen haben (Druck). */
export function combatFallbacksFrom(
  c: Pick<Character, 'ac' | 'classes' | 'proficiencyBonus'>,
  loaded: { worn: readonly WornItem[]; idle: readonly IdleItem[]; features: readonly ArmorClassFeature[] },
  scores: AbilityScores,
): CombatFallbacks {
  const mods = abilityRecordOf((k) => mod(scores[k]));
  const ac = armorClassDerivation({ ac: c.ac, ...loaded, mods });
  return combatFallbacks({ ...c, acTotal: ac.total, features: loaded.features, mods });
}

export async function loadCombatFallbacks(c: Character): Promise<CombatFallbacks> {
  const [loaded, effects] = await Promise.all([loadSavingThrowInputs(c), loadWornAbilityEffects(c.inventory ?? [])]);
  return combatFallbacksFrom(c, loaded, effectiveScores(c.abilities, effects));
}

export function withCombatFallbacks(c: Character, fb: CombatFallbacks): Character {
  return {
    ...c,
    ac: c.ac.trim() || (fb.ac === null ? '' : String(fb.ac)),
    initiative: c.initiative.trim() || fb.initiative,
    speed: c.speed.trim() || fb.speed,
    hpCurrent: c.hpCurrent.trim() || c.hpMax,
    proficiencyBonus: c.proficiencyBonus ?? fb.proficiencyBonus,
  };
}
