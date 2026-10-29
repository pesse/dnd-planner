/**
 * Gerechnete Kampfwerte samt `combatAdjustments`. Bogen, Druck und KI-Kontext zeigen sie über
 * `withCombatFallbacks`, solange kein Altwert eingetragen ist; in die Datei kommen sie nie.
 */
import type { Character, CharacterClass } from '../schemas/characterSchema';
import { totalLevel } from '../schemas/classLevelText';
import { abilityRecordOf, type AbilityScores } from '../schemas/abilities';
import { adjustmentSum, type CombatAdjustments } from '../schemas/combatAdjustment';
import type { FeatureGrant } from '../schemas/grants';
import { mod } from '../domain/skills';
import { armorClassDerivation, type ArmorClassFeature } from './armorClass';
import { declaredSpeed, speedMeters } from './characterProperties';
import { effectiveProficiencyBonus, proficiencyBonus } from './classProgression';
import { sign } from '../utils/num';
import { effectiveScores, loadWornAbilityEffects } from './effectiveAbilities';
import { adjustmentRows } from './hitPointDerivation';
import { hpBasisOf, hpMaxTotal, loadHpLibraryParts, type HpLibraryParts } from './hitPoints';
import { loadSavingThrowInputs } from './savingThrows';
import type { IdleItem, WornItem } from './wornItems';

export interface CombatFallbacks {
  /** null, solange Bibliotheken und Merkmale laden. */
  ac: number | null;
  /** null, solange die Bibliothek lädt oder die Würfelsumme unbekannt ist. */
  hpMax: number | null;
  /** '' ohne Deklaration oder solange die Merkmale laden. */
  speed: string;
  /** Das Merkmal, das die Bewegungsrate festlegt, dann die Anpassungen; leer ohne Deklaration. */
  speedRows: { labelDe: string; feet: number }[];
  level: number;
  /** Aus der Stufe samt Anpassungen, unabhängig vom eingetragenen Wert. */
  proficiencyBonus: number;
  /** Der Wert der Stufe, dann die Anpassungen. */
  proficiencyBonusRows: { labelDe: string; value: number }[];
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
  /** Aus der RK-Herleitung, die `combatAdjustments.ac` schon enthält. */
  acTotal: number | null;
  /** Aus `hpMaxTotal`, das `combatAdjustments.hpMax` schon enthält. */
  hpTotal: number | null;
  /** null, solange die Merkmale laden. */
  features: readonly FallbackFeature[] | null;
  /** Wirksamer GES-Modifikator, samt Gegenständen. */
  dexMod: number;
  combatAdjustments?: CombatAdjustments;
}): CombatFallbacks {
  const classes = [...input.classes];
  const adj = input.combatAdjustments;
  const declared = input.features ? declaredSpeed(input.features) : null;
  const speedRows = declared
    ? [{ labelDe: declared.labelDe, feet: declared.feet }, ...adjustmentRows(adj?.speed).map((r) => ({ labelDe: r.labelDe, feet: r.value }))]
    : [];
  const level = totalLevel(classes);
  const alert = input.features?.find(isAlert);
  const initiativeRows = [
    { labelDe: 'GES', value: input.dexMod },
    ...(alert ? [{ labelDe: alert.name, value: effectiveProficiencyBonus({ ...input, classes }) }] : []),
    ...adjustmentRows(adj?.initiative),
  ];
  return {
    ac: input.acTotal,
    hpMax: input.hpTotal,
    speed: declared ? speedMeters(declared.feet + adjustmentSum(adj?.speed)) : '',
    speedRows,
    level,
    proficiencyBonus: effectiveProficiencyBonus({ classes, combatAdjustments: adj }),
    proficiencyBonusRows: [{ labelDe: `Stufe ${level}`, value: proficiencyBonus(level) }, ...adjustmentRows(adj?.proficiencyBonus)],
    initiative: sign(initiativeRows.reduce((n, r) => n + r.value, 0)),
    initiativeRows,
  };
}

type FallbackCharacter = Pick<Character, 'ac' | 'hpMax' | 'hpDiceTotal' | 'combatAdjustments' | 'classes' | 'proficiencyBonus'>;

/** Für Aufrufer, die Inventar, Merkmale und TP-Basis schon geladen haben (Druck). */
export function combatFallbacksFrom(
  c: FallbackCharacter,
  loaded: { worn: readonly WornItem[]; idle: readonly IdleItem[]; features: readonly ArmorClassFeature[] },
  scores: AbilityScores,
  hp: HpLibraryParts | null,
): CombatFallbacks {
  const ac = armorClassDerivation({
    ac: c.ac, ...loaded, mods: abilityRecordOf((k) => mod(scores[k])), adjustments: c.combatAdjustments?.ac,
  });
  const hpTotal = hp && hpMaxTotal(c, hpBasisOf(c.classes, mod(scores.con), hp));
  return combatFallbacks({ ...c, acTotal: ac.total, hpTotal, features: loaded.features, dexMod: mod(scores.dex) });
}

export async function loadCombatFallbacks(c: Character): Promise<CombatFallbacks> {
  const [loaded, effects, hp] = await Promise.all([
    loadSavingThrowInputs(c), loadWornAbilityEffects(c.inventory ?? []), loadHpLibraryParts(c),
  ]);
  return combatFallbacksFrom(c, loaded, effectiveScores(c.abilities, effects), hp);
}

export function withCombatFallbacks(c: Character, fb: CombatFallbacks): Character {
  const hpMax = c.hpMax.trim() || (fb.hpMax === null ? '' : String(fb.hpMax));
  return {
    ...c,
    ac: c.ac.trim() || (fb.ac === null ? '' : String(fb.ac)),
    initiative: c.initiative.trim() || fb.initiative,
    speed: c.speed.trim() || fb.speed,
    hpMax,
    hpCurrent: c.hpCurrent.trim() || hpMax,
    proficiencyBonus: c.proficiencyBonus ?? fb.proficiencyBonus,
  };
}

/** Für Vorschauen ohne eigene Herleitung; scheitert das Laden, bleibt der Charakter wie er ist. */
export const withShownCombatValues = (c: Character): Promise<Character> =>
  loadCombatFallbacks(c).then((fb) => withCombatFallbacks(c, fb), () => c);
