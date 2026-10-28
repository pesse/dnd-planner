/**
 * Welche deklarierten Wirkungen ein Angriff bekommt: angelegte Gegenstände und Merkmale,
 * gefiltert über die verknüpfte Waffe. `attackCalc` rechnet damit.
 */
import type { AttackEffect } from '../schemas/attackEffect';
import type { FeatureGrant } from '../schemas/grants';
import { situationalLabelDe } from '../schemas/situationalBonus';
import { buildItemIndex, displayName, getAllItemsByDir, matchItem, type ItemIndex, type ItemInfo } from '../itemLibrary';
import { featureIdOf, normName } from '../utils/text';
import { sign } from '../utils/num';
import type { Attack, Character, CharacterInventoryEntry } from '../schemas/characterSchema';
import { wornItemsIn, type WornItem } from './wornItems';
import { ownedGrantFeatures, type OwnedLinks } from './hitPoints';

export interface AttackEffectSource {
  labelDe: string;
  effect: AttackEffect;
}

export interface AttackEffectFeature {
  key?: string;
  name: string;
  grants?: FeatureGrant;
}

export interface DeclaredAttackEffects {
  sources: readonly AttackEffectSource[];
  weaponOf: (a: Pick<Attack, 'sourceKey' | 'name'>) => ItemInfo | undefined;
}

export interface AttackEffectRow {
  labelDe: string;
  attack: number;
  damage: number;
}

export interface AppliedAttackEffects {
  rows: AttackEffectRow[];
  attackNotes: string[];
  damageNotes: string[];
}

export function attackEffectSources(worn: readonly WornItem[], features: readonly AttackEffectFeature[]): AttackEffectSource[] {
  const fromItems = worn.flatMap(({ item }) =>
    (item.attackEffects ?? []).map((effect) => ({ labelDe: displayName(item), effect })));
  const seen = new Set<string>();
  const fromFeatures: AttackEffectSource[] = [];
  for (const f of features) {
    const id = featureIdOf(f);
    if (seen.has(id)) continue;
    seen.add(id);
    fromFeatures.push(...(f.grants?.attack ?? []).map((effect) => ({ labelDe: f.name, effect })));
  }
  return [...fromItems, ...fromFeatures];
}

export function declaredAttackEffects(
  index: ItemIndex,
  inventory: CharacterInventoryEntry[],
  features: readonly AttackEffectFeature[],
): DeclaredAttackEffects {
  return {
    sources: attackEffectSources(wornItemsIn(index, inventory), features),
    weaponOf: (a) => matchItem(index, { sourceKey: a.sourceKey, name: a.name }),
  };
}

/** Für Aufrufer ohne reaktive Bibliotheken (Druck). */
export async function loadDeclaredAttackEffects(
  c: OwnedLinks & Pick<Character, 'inventory'>,
): Promise<DeclaredAttackEffects> {
  const [index, features] = await Promise.all([getAllItemsByDir().then(buildItemIndex), ownedGrantFeatures(c)]);
  return declaredAttackEffects(index, c.inventory ?? [], features);
}

export interface CriticalRange {
  minRoll: number;
  labelDe: string;
}

/** Der weiteste Bereich zählt; der Champion trägt 19 und 18 gleichzeitig. */
export function criticalRange(features: readonly AttackEffectFeature[]): CriticalRange | null {
  let best: CriticalRange | null = null;
  for (const f of features) {
    const minRoll = f.grants?.criticalHit;
    if (minRoll !== undefined && (!best || minRoll < best.minRoll)) best = { minRoll, labelDe: f.name };
  }
  return best;
}

export const criticalRangeDe = (c: CriticalRange): string => `Kritischer Treffer bei ${c.minRoll}–20 (${c.labelDe})`;

const filtered = (e: AttackEffect): boolean => e.range !== 'any' || !!e.weapons?.length;

function weaponMatches(e: AttackEffect, weapon: ItemInfo): boolean {
  if (e.range === 'melee' && weapon.weapon_range !== 'Melee') return false;
  if (e.range === 'ranged' && weapon.weapon_range !== 'Ranged') return false;
  return !e.weapons?.length || e.weapons.includes(weapon.index ?? '');
}

/** Ein von Hand eingetragener Effekt gleichen Namens („Kampfstil „Bogenschießen“") zählt schon. */
const enteredByHand = (a: Attack, labelDe: string): boolean =>
  (a.modifiers ?? []).some((m) => normName(m.label).includes(normName(labelDe)));

const touches = (e: AttackEffect): { attack: boolean; damage: boolean } =>
  e.kind === 'bonus' ? { attack: e.attack !== 0, damage: e.damage !== 0 } : { attack: e.roll === 'attack', damage: e.roll === 'damage' };

/** Der Bonus der Bibliothek, wo der Angriff einen anderen trägt — er wurde beim Anlegen kopiert. */
export function staleMagicBonus(a: Pick<Attack, 'magicBonus'>, weapon: ItemInfo | undefined): number | undefined {
  if (!weapon) return undefined;
  const lib = weapon.magic_bonus ?? 0;
  return lib !== (a.magicBonus ?? 0) ? lib : undefined;
}

export function attackEffectRows(a: Attack, declared: DeclaredAttackEffects | undefined): AppliedAttackEffects {
  const out: AppliedAttackEffects = { rows: [], attackNotes: [], damageNotes: [] };
  if (!declared) return out;
  const weapon = declared.weaponOf(a);
  const note = (e: AttackEffect, text: string) => {
    const t = touches(e);
    if (t.attack) out.attackNotes.push(text);
    if (t.damage) out.damageNotes.push(text);
  };

  for (const { labelDe, effect } of declared.sources) {
    if (filtered(effect)) {
      if (!weapon) {
        note(effect, `${labelDe}: Waffe nicht mit der Bibliothek verknüpft`);
        continue;
      }
      if (!weaponMatches(effect, weapon)) continue;
    }
    if (enteredByHand(a, labelDe)) {
      note(effect, `${labelDe}: schon als Effekt eingetragen`);
      continue;
    }
    if (effect.kind === 'bonus') out.rows.push({ labelDe, attack: effect.attack, damage: effect.damage });
    else note(effect, `${labelDe} ${sign(effect.value)}: ${situationalLabelDe(effect)}`);
  }

  const libraryMagic = staleMagicBonus(a, weapon);
  if (weapon && libraryMagic !== undefined) {
    const text = `${displayName(weapon)}: laut Bibliothek Magie ${sign(libraryMagic)}`;
    out.attackNotes.push(text);
    out.damageNotes.push(text);
  }
  return out;
}
