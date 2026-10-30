/**
 * Welche deklarierten Wirkungen ein Angriff bekommt: angelegte Gegenstände und Merkmale,
 * gefiltert über die verknüpfte Waffe. `attackCalc` rechnet damit.
 */
import type { AttackEffect } from '../schemas/attackEffect';
import type { SpellAttack } from '../schemas/spellAttack';
import type { FeatureGrant } from '../schemas/grants';
import { situationalLabelDe } from '../schemas/situationalBonus';
import { buildItemIndex, displayName, getAllItemsByDir, matchItem, type ItemIndex, type ItemInfo } from '../itemLibrary';
import { featureIdOf, normName } from '../utils/text';
import { DAMAGE_TYPE_LABELS, PROPERTY_LABELS, WEAPON_RANGE_LABELS } from '../itemLabels';
import { formatDamageDice } from '../itemFormat';
import { levelStep } from './resources/amount';
import { sign } from '../utils/num';
import type { Attack, Character, CharacterInventoryEntry } from '../schemas/characterSchema';
import { wornItemsIn, type WornItem } from './wornItems';
import { ownedGrantFeatures, type OwnedLinks } from './hitPoints';

export interface AttackEffectSource {
  labelDe: string;
  effect: AttackEffect;
  /** Stufe, nach der `dice.byLevel` greift. */
  level?: number;
}

export interface AttackEffectFeature {
  key?: string;
  name: string;
  grants?: FeatureGrant;
  level?: number;
}

/** Ein Zauber des Charakters mit `attackEffects` — wirkt nur, solange er gewirkt ist, steht also als Hinweis. */
export interface AttackEffectSpell {
  name: string;
  effects: readonly AttackEffect[];
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

export function attackEffectSources(
  worn: readonly WornItem[],
  features: readonly AttackEffectFeature[],
  spells: readonly AttackEffectSpell[] = [],
): AttackEffectSource[] {
  const fromItems = worn.flatMap(({ item }) =>
    (item.attackEffects ?? []).map((effect) => ({ labelDe: displayName(item), effect })));
  const seen = new Set<string>();
  const fromFeatures: AttackEffectSource[] = [];
  for (const f of features) {
    const id = featureIdOf(f);
    if (seen.has(id)) continue;
    seen.add(id);
    fromFeatures.push(...(f.grants?.attack ?? []).map((effect) => ({ labelDe: f.name, effect, level: f.level })));
  }
  const fromSpells = spells.flatMap((sp) => sp.effects.map((effect) => ({ labelDe: sp.name, effect })));
  return [...fromItems, ...fromFeatures, ...fromSpells];
}

export function declaredAttackEffects(
  index: ItemIndex,
  inventory: CharacterInventoryEntry[],
  features: readonly AttackEffectFeature[],
  spells: readonly AttackEffectSpell[] = [],
): DeclaredAttackEffects {
  return {
    sources: attackEffectSources(wornItemsIn(index, inventory), features, spells),
    weaponOf: (a) => matchItem(index, { sourceKey: a.sourceKey, name: a.name }),
  };
}

/** Für Aufrufer ohne reaktive Bibliotheken (Druck). */
export async function loadDeclaredAttackEffects(
  c: OwnedLinks & Pick<Character, 'inventory'>,
  spells: readonly AttackEffectSpell[] = [],
): Promise<DeclaredAttackEffects> {
  const [index, features] = await Promise.all([getAllItemsByDir().then(buildItemIndex), ownedGrantFeatures(c)]);
  return declaredAttackEffects(index, c.inventory ?? [], features, spells);
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

const filtered = (e: AttackEffect): boolean =>
  e.range !== 'any' || !!e.weapons?.length || !!e.properties?.length || !!e.damageTypes?.length;

/** Zauberzeilen tragen nur, was ausdrücklich auch für Zauberangriffswürfe gilt. */
function spellMatches(e: AttackEffect, spell: SpellAttack): boolean {
  if (!e.spellAttacks || spell.roll !== 'attack') return false;
  if (e.range !== 'any' && e.range !== spell.range) return false;
  if (e.weapons?.length || e.properties?.length) return false;
  return !e.damageTypes?.length || spell.damage.some((d) => !!d.type && (e.damageTypes as readonly string[]).includes(d.type));
}

function weaponMatches(e: AttackEffect, weapon: ItemInfo): boolean {
  if (e.range === 'melee' && weapon.weapon_range !== 'Melee') return false;
  if (e.range === 'ranged' && weapon.weapon_range !== 'Ranged') return false;
  if (e.properties?.length && !weapon.properties?.some((p) => (e.properties as readonly string[]).includes(p.index))) return false;
  if (e.damageTypes?.length && !(e.damageTypes as readonly string[]).includes(weapon.damage?.damage_type.index ?? '')) return false;
  return !e.weapons?.length || e.weapons.includes(weapon.index ?? '');
}

/** Ein von Hand eingetragener Effekt gleichen Namens („Kampfstil „Bogenschießen“") zählt schon. */
const enteredByHand = (a: Attack, labelDe: string): boolean =>
  (a.modifiers ?? []).some((m) => normName(m.label).includes(normName(labelDe)));

const touches = (e: AttackEffect): { attack: boolean; damage: boolean } =>
  e.kind === 'bonus' ? { attack: e.attack !== 0, damage: e.damage !== 0 }
  : e.kind === 'dice' ? { attack: false, damage: true }
  : e.kind === 'note' ? { attack: true, damage: false }
  : { attack: e.roll === 'attack', damage: e.roll === 'damage' };

type DiceEffect = Extract<AttackEffect, { kind: 'dice' }>;

/** „Schreckliche Schläge +1W4 Psychischer Schaden: einmal pro Zug"; leer unterhalb der ersten Stufe. */
function diceNote(labelDe: string, e: DiceEffect, level: number): string | null {
  const dice = typeof e.dice === 'string' ? e.dice : levelStep(e.dice.byLevel, level);
  if (!dice) return null;
  const type = e.damageType ? ` ${DAMAGE_TYPE_LABELS[e.damageType]}` : '';
  return `${labelDe} +${formatDamageDice(dice)}${type}: ${situationalLabelDe(e)}`;
}

/** „ (Nahkampf; Schwer oder Vielseitig; Stichschaden)" — für wen die Zeile unter der Tabelle gilt. */
function filterDe(e: AttackEffect): string {
  const parts = [
    e.range === 'melee' ? WEAPON_RANGE_LABELS.Melee : e.range === 'ranged' ? WEAPON_RANGE_LABELS.Ranged : '',
    (e.properties ?? []).map((p) => PROPERTY_LABELS[p] ?? p).join(' oder '),
    (e.damageTypes ?? []).map((t) => DAMAGE_TYPE_LABELS[t]).join(' oder '),
  ].filter(Boolean);
  return parts.length ? ` (${parts.join('; ')})` : '';
}

function footnote(labelDe: string, e: AttackEffect, level: number): string | null {
  if (e.kind === 'note') return `${labelDe}: ${situationalLabelDe(e)}${filterDe(e)}`;
  if (e.kind !== 'dice') return null;
  const text = diceNote(labelDe, e, level);
  return text && text + filterDe(e);
}

/**
 * Was für alle Angriffe gilt, als Zeilen unter der Angriffstabelle: kritischer Bereich und
 * Zusatzwürfel. Im Tooltip des Schadens fände sie niemand, und der Druck hat keinen.
 */
export function attackFootnotes(
  features: readonly AttackEffectFeature[],
  spells: readonly AttackEffectSpell[] = [],
): string[] {
  const range = criticalRange(features);
  const lines = attackEffectSources([], features, spells).flatMap(({ labelDe, effect, level }) => {
    const text = footnote(labelDe, effect, level ?? 1);
    return text ? [text] : [];
  });
  return [...(range ? [criticalRangeDe(range)] : []), ...lines];
}

/** Der Bonus der Bibliothek, wo der Angriff einen anderen trägt — er wurde beim Anlegen kopiert. */
export function staleMagicBonus(a: Pick<Attack, 'magicBonus'>, weapon: ItemInfo | undefined): number | undefined {
  if (!weapon) return undefined;
  const lib = weapon.magic_bonus ?? 0;
  return lib !== (a.magicBonus ?? 0) ? lib : undefined;
}

export function attackEffectRows(
  a: Attack,
  declared: DeclaredAttackEffects | undefined,
  profBonus: number,
  spell?: SpellAttack,
): AppliedAttackEffects {
  const out: AppliedAttackEffects = { rows: [], attackNotes: [], damageNotes: [] };
  if (!declared) return out;
  const weapon = spell ? undefined : declared.weaponOf(a);
  const note = (e: AttackEffect, text: string) => {
    const t = touches(e);
    if (t.attack) out.attackNotes.push(text);
    if (t.damage) out.damageNotes.push(text);
  };

  for (const { labelDe, effect, level } of declared.sources) {
    if (spell) {
      if (!spellMatches(effect, spell)) continue;
    } else if (filtered(effect)) {
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
    else if (effect.kind === 'dice') {
      const text = diceNote(labelDe, effect, level ?? 1);
      if (text) note(effect, text);
    } else if (effect.kind === 'note') note(effect, `${labelDe}: ${situationalLabelDe(effect)}`);
    else {
      const value = effect.value === 'proficiency-bonus' ? profBonus : effect.value;
      note(effect, `${labelDe} ${sign(value)}: ${situationalLabelDe(effect)}`);
    }
  }

  const libraryMagic = staleMagicBonus(a, weapon);
  if (weapon && libraryMagic !== undefined) {
    const text = `${displayName(weapon)}: laut Bibliothek Magie ${sign(libraryMagic)}`;
    out.attackNotes.push(text);
    out.damageNotes.push(text);
  }
  return out;
}
