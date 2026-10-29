/**
 * Die RK aus angelegten Gegenständen, Merkmals-Deklarationen und `combatAdjustments.ac`, als
 * Posten wie die TP-Herleitung. Ein eingetragenes `character.ac` erscheint als Abweichung.
 */
import { ABILITY_ABBR_DE, ABILITY_KEYS, ABILITY_LABEL, ABILITY_NAMES, type AbilityKey, type AbilityScores } from '../schemas/abilities';
import type { ArmorClassCondition, ArmorClassEffect } from '../schemas/armorClass';
import type { FeatureGrant } from '../schemas/grants';
import { situationalLabelDe } from '../schemas/situationalBonus';
import { displayName, type ItemInfo } from '../itemLibrary';
import { featureIdOf } from '../utils/text';
import { sign } from '../utils/num';
import { adjustmentRows, type DerivationRow } from './hitPointDerivation';
import type { CombatAdjustment } from '../schemas/combatAdjustment';
import type { IdleItem, WornItem } from './wornItems';

type Unarmored = Extract<ArmorClassEffect, { kind: 'unarmored' }>;
type Bonus = Extract<ArmorClassEffect, { kind: 'bonus' }>;
type Situational = Extract<ArmorClassEffect, { kind: 'situational' }>;

export interface ArmorClassSource {
  labelDe: string;
  effect: ArmorClassEffect;
}

export interface ArmorClassFeature {
  key?: string;
  name: string;
  desc?: string;
  grants?: FeatureGrant;
}

export interface ArmorClassDerivation {
  /** Die erste Zeile ist die Basis und trägt kein Vorzeichen. */
  rows: DerivationRow[];
  total: number;
  /** Die eingetragene RK; null, wo keine Zahl steht. */
  stored: number | null;
  notes: string[];
}

const BODY_ARMOR = ['Light', 'Medium', 'Heavy'];

const ABILITY_IN_TEXT: Record<AbilityKey, RegExp> = Object.fromEntries(
  ABILITY_KEYS.map((k, i) => [k, new RegExp(`${ABILITY_NAMES[i]}|${ABILITY_LABEL[k]}`, 'i')]),
) as Record<AbilityKey, RegExp>;

/**
 * Rückfall für Merkmale ohne `grants`, wie `isWeaponMasteryFeature`: der Key erkennt
 * Ungerüstete Verteidigung, die Attribute und die Schild-Klausel stehen im Text.
 */
function fallbackEffects(f: ArmorClassFeature): ArmorClassEffect[] {
  const desc = f.desc ?? '';
  if (/unarmored-defense$/.test(f.key ?? '')) {
    const abilities = ABILITY_KEYS.filter((k) => k === 'dex' || ABILITY_IN_TEXT[k].test(desc));
    const shield = !/shield|schild/i.test(desc) || /can use a shield|kannst einen schild/i.test(desc);
    return [{ kind: 'unarmored', base: 10, abilities, shield }];
  }
  if (/^[a-z0-9-]+_defense$/.test(f.key ?? '')) return [{ kind: 'bonus', value: 1, when: 'armored' }];
  return [];
}

export function armorClassSources(worn: readonly WornItem[], features: readonly ArmorClassFeature[]): ArmorClassSource[] {
  const fromItems = worn.flatMap(({ item }) =>
    (item.armorClassEffects ?? []).map((effect) => ({ labelDe: displayName(item), effect })));
  const seen = new Set<string>();
  const fromFeatures: ArmorClassSource[] = [];
  for (const f of features) {
    const id = featureIdOf(f);
    if (seen.has(id)) continue;
    seen.add(id);
    const effects = f.grants ? (f.grants.armorClass ?? []) : fallbackEffects(f);
    fromFeatures.push(...effects.map((effect) => ({ labelDe: f.name, effect })));
  }
  return [...fromItems, ...fromFeatures];
}

const itemAc = (item: ItemInfo): number => (item.armor_class?.base ?? 0) + (item.magic_bonus ?? 0);

const magicNotes = (item: ItemInfo): string[] =>
  item.magic_bonus ? [`${item.armor_class?.base ?? 0} ${sign(item.magic_bonus)} magisch`] : [];

const best = <T>(list: readonly T[], value: (t: T) => number): T | undefined =>
  list.reduce<T | undefined>((a, b) => (a === undefined || value(b) > value(a) ? b : a), undefined);

/** Was GES in dieser Rüstung zur RK beiträgt; null, wo die Rüstung GES gar nicht zählt. */
export function armorDexBonus(item: Pick<ItemInfo, 'armor_class'>, dexMod: number): number | null {
  const ac = item.armor_class;
  if (!ac?.dex_bonus) return null;
  return ac.max_bonus === null ? dexMod : Math.min(dexMod, ac.max_bonus);
}

function armorRows(item: ItemInfo, dexMod: number): DerivationRow[] {
  const rows: DerivationRow[] = [{ labelDe: displayName(item), value: itemAc(item), notes: magicNotes(item) }];
  const ac = item.armor_class;
  const capped = armorDexBonus(item, dexMod);
  if (!ac || capped === null) return rows;
  rows.push({ labelDe: 'GES', value: capped, notes: capped < dexMod ? [`${sign(dexMod)}, höchstens ${sign(ac.max_bonus!)}`] : [] });
  return rows;
}

const rowSum = (rows: readonly DerivationRow[]): number => rows.reduce((n, r) => n + r.value, 0);

const formulaValue = (f: Unarmored, mods: AbilityScores): number =>
  f.base + f.abilities.reduce((n, k) => n + mods[k], 0);

const formulaRows = (labelDe: string, f: Unarmored, mods: AbilityScores): DerivationRow[] => [
  { labelDe, value: f.base, notes: [] },
  ...f.abilities.map((k) => ({ labelDe: ABILITY_ABBR_DE[k], value: mods[k], notes: [] })),
];

const CONDITION_DE: Record<ArmorClassCondition, string> = {
  always: '',
  armored: 'nur in Rüstung',
  unarmored: 'nur ohne Rüstung',
  unarmoredNoShield: 'nur ohne Rüstung und Schild',
};

function conditionMet(when: ArmorClassCondition, armored: boolean, shield: boolean): boolean {
  if (when === 'armored') return armored;
  if (when === 'unarmored') return !armored;
  if (when === 'unarmoredNoShield') return !armored && !shield;
  return true;
}

function baseRows(
  armor: ItemInfo | undefined,
  hasShield: boolean,
  formulas: { labelDe: string; effect: Unarmored }[],
  mods: AbilityScores,
): DerivationRow[] {
  const usable = formulas.filter((f) => hasShield ? f.effect.shield : true);
  const blocked = formulas.filter((f) => !usable.includes(f)).map((f) => `${f.labelDe}: nicht mit Schild`);
  if (armor) {
    const rows = armorRows(armor, mods.dex);
    rows[0].notes.push(...usable.map((f) => `${f.labelDe} ohne Rüstung: ${formulaValue(f.effect, mods)}`), ...blocked);
    return rows;
  }
  const chosen = best(usable, (f) => formulaValue(f.effect, mods));
  const plain: Unarmored = { kind: 'unarmored', base: 10, abilities: ['dex'], shield: true };
  if (!chosen || formulaValue(chosen.effect, mods) < formulaValue(plain, mods))
    return formulaRows('ohne Rüstung', plain, mods);
  const rows = formulaRows(chosen.labelDe, chosen.effect, mods);
  rows[0].notes.push(
    ...usable.filter((f) => f !== chosen).map((f) => `${f.labelDe}: ${formulaValue(f.effect, mods)}`),
    ...blocked,
  );
  return rows;
}

export function armorClassDerivation(input: {
  ac: string;
  worn: readonly WornItem[];
  /** Fehlt, wo der Aufrufer das Inventar nicht kennt. */
  idle?: readonly IdleItem[];
  features: readonly ArmorClassFeature[];
  /** Wirksame Mods (`effectiveMods`). */
  mods: AbilityScores;
  adjustments?: readonly CombatAdjustment[];
}): ArmorClassDerivation {
  const items = input.worn.map((w) => w.item).filter((i) => i.armor_class);
  const armors = items.filter((i) => BODY_ARMOR.includes(i.armor_category ?? ''));
  const shields = items.filter((i) => i.armor_category === 'Shield');
  const armor = best(armors, (i) => rowSum(armorRows(i, input.mods.dex)));
  const shield = best(shields, itemAc);
  const sources = armorClassSources(input.worn, input.features);
  const formulas = sources.filter((s): s is { labelDe: string; effect: Unarmored } => s.effect.kind === 'unarmored');
  const bonuses = sources.filter((s): s is { labelDe: string; effect: Bonus } => s.effect.kind === 'bonus');
  const situational = sources.filter((s): s is { labelDe: string; effect: Situational } => s.effect.kind === 'situational');

  const rows = baseRows(armor, !!shield, formulas, input.mods);
  if (shield) rows.push({ labelDe: displayName(shield), value: itemAc(shield), notes: magicNotes(shield) });
  const notes: string[] = [];
  if (armors.length > 1) notes.push(`${armors.length} Rüstungen angelegt, gezählt nur ${displayName(armor!)}`);
  if (shields.length > 1) notes.push(`${shields.length} Schilde angelegt, gezählt nur ${displayName(shield!)}`);
  for (const b of bonuses) {
    if (conditionMet(b.effect.when, !!armor, !!shield)) rows.push({ labelDe: b.labelDe, value: b.effect.value, notes: [] });
    else notes.push(`${b.labelDe} ${sign(b.effect.value)}: ${CONDITION_DE[b.effect.when]}`);
  }
  for (const b of situational) {
    const line = `${sign(b.effect.value)} ${situationalLabelDe(b.effect)}`;
    // Unter der Zeile des eigenen Gegenstands, wo es eine gibt — sonst stünde sein Name doppelt.
    const own = rows.find((r) => r.labelDe === b.labelDe);
    if (own) own.notes.push(line);
    else notes.push(`${b.labelDe} ${line}`);
  }

  rows.push(...adjustmentRows(input.adjustments));

  for (const { item, reason } of input.idle ?? [])
    if (item.armor_class || item.armorClassEffects?.length)
      notes.push(`${displayName(item)}: ${reason === 'unequipped' ? 'nicht angelegt' : 'nicht eingestimmt'}`);

  // „18 (20)" heißt am Tisch: 18, mit Schild 20 — maßgeblich ist die erste Zahl.
  const lead = input.ac.trim().match(/^\d+/);
  const stored = lead ? Number(lead[0]) : null;
  return { rows, total: rowSum(rows), stored, notes };
}
