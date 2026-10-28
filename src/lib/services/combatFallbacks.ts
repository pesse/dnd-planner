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
import { effectiveProficiencyBonus } from './classProgression';
import { sign } from '../utils/num';
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
  /** Aus der Stufe, unabhängig vom eingetragenen Wert. */
  proficiencyBonus: number;
  /** Mit Vorzeichen, wie `character.initiative` ihn führt. */
  initiative: string;
  initiativeRows: { labelDe: string; value: number }[];
}

type FallbackFeature = { key?: string; name: string; grants?: FeatureGrant };

/** Aufmerksam (Alert) hat keine Deklaration; der Key erkennt es wie `fallbackEffects` die Ungerüstete Verteidigung. */
const isAlert = (f: FallbackFeature): boolean => /(^|_)alert$/.test(f.key ?? '');

export function combatFallbacks(input: {
  classes: readonly CharacterClass[];
  /** Der eingetragene; Aufmerksam addiert den wirksamen. */
  proficiencyBonus?: number | null;
  acTotal: number | null;
  /** null, solange die Merkmale laden. */
  features: readonly FallbackFeature[] | null;
  /** Wirksamer GES-Modifikator, samt Gegenständen. */
  dexMod: number;
}): CombatFallbacks {
  const classes = [...input.classes];
  const speed = input.features ? declaredSpeed(input.features) : null;
  const level = totalLevel(classes);
  const alert = input.features?.find(isAlert);
  const initiativeRows = [
    { labelDe: 'GES', value: input.dexMod },
    ...(alert ? [{ labelDe: alert.name, value: effectiveProficiencyBonus({ ...input, classes }) }] : []),
  ];
  return {
    ac: input.acTotal,
    speed: speed?.meters ?? '',
    speedSource: speed && { labelDe: speed.labelDe, feet: speed.feet },
    level,
    proficiencyBonus: effectiveProficiencyBonus({ classes }),
    initiative: sign(initiativeRows.reduce((n, r) => n + r.value, 0)),
    initiativeRows,
  };
}

/** Für Aufrufer, die Inventar und Merkmale schon geladen haben (Druck). */
export function combatFallbacksFrom(
  c: Pick<Character, 'ac' | 'classes' | 'proficiencyBonus'>,
  loaded: { worn: readonly WornItem[]; idle: readonly IdleItem[]; features: readonly ArmorClassFeature[] },
  scores: AbilityScores,
): CombatFallbacks {
  const ac = armorClassDerivation({ ac: c.ac, ...loaded, mods: abilityRecordOf((k) => mod(scores[k])) });
  return combatFallbacks({ ...c, acTotal: ac.total, features: loaded.features, dexMod: mod(scores.dex) });
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
