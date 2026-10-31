/** Die mechanischen Deklarationen eines Gegenstands als deutsche Kartenzeilen. */
import type { Item } from '$lib/types';
import { ABILITY_ABBR_DE, ABILITY_LABEL, abilityKeyOf, type AbilityKey } from '$lib/schemas/abilities';
import type { AbilityEffect } from '$lib/schemas/item';
import type { ArmorClassEffect } from '$lib/schemas/armorClass';
import type { SaveBonusValue, SavingThrowEffect } from '$lib/schemas/savingThrow';
import type { AttackEffect } from '$lib/schemas/attackEffect';
import type { DefenseEffect } from '$lib/schemas/defense';
import { situationalLabelDe } from '$lib/schemas/situationalBonus';
import { CONDITIONS, type DamageType } from '$lib/schemas/vocabulary';
import { SLOT_LABEL_DE } from '$lib/schemas/equipmentSlot';
import { DAMAGE_TYPE_LABELS, PROPERTY_LABELS, damageTypeShort } from '$lib/itemLabels';
import { formatDamageDice } from '$lib/itemFormat';
import { sign } from '$lib/utils/num';
import { CONDITION_DE } from './armorClass';
import { RECHARGE_DE } from './resources/project';

/** Volle Datei und Bibliotheks-Index (`ItemInfo`) tragen dieselben Felder. */
export type DeclaringItem = Pick<
  Item,
  | 'abilityEffects' | 'armorClassEffects' | 'savingThrowEffects' | 'attackEffects' | 'defenses'
  | 'resistanceChoice' | 'optionChoice' | 'grantsResource' | 'grantsCasting' | 'slot'
>;

export interface DeclarationLine {
  label: string;
  text: string;
}

const join = (...parts: (string | undefined | false)[]): string => parts.filter(Boolean).join(' ');
const paren = (s: string | undefined): string => (s?.trim() ? `(${s.trim()})` : '');
const damageList = (types: readonly DamageType[]): string =>
  types.map((t) => damageTypeShort(DAMAGE_TYPE_LABELS[t] ?? t)).join(', ');

export function abilityEffectText(e: AbilityEffect): string {
  const name = ABILITY_LABEL[e.ability];
  if (e.kind === 'set') return `${name} beträgt ${e.value}`;
  return join(
    `${name} ${sign(e.value)}`,
    e.max != null && `(höchstens ${e.max})`,
    e.onSetBy.length > 0 && '— nur auf einen von bestimmten Gegenständen gesetzten Wert',
  );
}

export function armorClassEffectText(e: ArmorClassEffect): string {
  if (e.kind === 'unarmored')
    return join(
      `ohne Rüstung ${[String(e.base), ...e.abilities.map((k) => `${ABILITY_ABBR_DE[k]}-Mod`)].join(' + ')}`,
      !e.shield && '(nur ohne Schild)',
    );
  if (e.kind === 'situational') return `${sign(e.value)} ${situationalLabelDe(e)}`;
  return join(sign(e.value), paren(CONDITION_DE[e.when]));
}

function saveValueText(v: SaveBonusValue): string {
  if (typeof v === 'number') return sign(v);
  if (v === 'proficiency-bonus') return '+ Übungsbonus';
  const key = abilityKeyOf(v.abilityMod);
  return `+ ${key ? ABILITY_ABBR_DE[key] : v.abilityMod}-Mod (mindestens ${sign(v.min)})`;
}

const savesOf = (abilities: readonly AbilityKey[]): string =>
  abilities.length ? `auf Rettungswürfe (${abilities.map((k) => ABILITY_ABBR_DE[k]).join(', ')})` : 'auf alle Rettungswürfe';

export function savingThrowEffectText(e: SavingThrowEffect): string {
  if (e.kind === 'bonus') return `${saveValueText(e.value)} ${savesOf(e.abilities)}`;
  if (e.kind === 'situational') return `${sign(e.value)} ${savesOf(e.abilities)} ${situationalLabelDe(e)}`;
  const target = e.deathSave ? 'auf Todesrettungswürfe' : savesOf(e.abilities);
  return join(`Vorteil ${target}`, e.conditionDe?.trim() || e.condition);
}

function weaponFilterText(e: AttackEffect): string {
  if (e.self) return 'mit dieser Waffe';
  const parts: string[] = [];
  if (e.range === 'melee') parts.push('Nahkampfwaffen');
  if (e.range === 'ranged') parts.push('Fernkampfwaffen');
  if (e.weapons?.length) parts.push(e.weapons.join(', '));
  if (e.properties?.length) parts.push(`Eigenschaft ${e.properties.map((p) => PROPERTY_LABELS[p] ?? p).join('/')}`);
  if (e.damageTypes?.length) parts.push(damageList(e.damageTypes));
  const weapons = parts.length ? `mit ${parts.join(', ')}` : 'mit Waffen';
  return e.spellAttacks ? `${weapons} und Zaubern` : weapons;
}

export function attackEffectText(e: AttackEffect): string {
  const filter = weaponFilterText(e);
  if (e.kind === 'bonus') {
    const rolls = [e.attack && `${sign(e.attack)} Angriff`, e.damage && `${sign(e.damage)} Schaden`].filter(Boolean);
    return join(rolls.join(', ') || '±0', filter);
  }
  if (e.kind === 'situational') {
    const value = e.value === 'proficiency-bonus' ? '+ Übungsbonus' : sign(e.value);
    return join(`${value} ${e.roll === 'attack' ? 'Angriff' : 'Schaden'}`, filter, situationalLabelDe(e));
  }
  if (e.kind === 'dice') {
    const dice = typeof e.dice === 'string' ? `+${formatDamageDice(e.dice)}` : '+Würfel nach Stufe';
    return join(dice, e.damageType && damageTypeShort(DAMAGE_TYPE_LABELS[e.damageType]), filter, situationalLabelDe(e));
  }
  return join(situationalLabelDe(e), paren(filter));
}

export function defenseLines(d: DefenseEffect & { when?: Record<string, string> }, optionLabel: (v: string) => string): DeclarationLine[] {
  const cond = join(d.conditionDe?.trim() || d.condition, d.when?.option && `bei ${optionLabel(d.when.option)}`);
  const line = (label: string, text: string): DeclarationLine => ({ label, text: join(text, paren(cond)) });
  const out: DeclarationLine[] = [];
  if (d.resistances.length) out.push(line('Resistenz', damageList(d.resistances)));
  if (d.immunities.length) out.push(line('Immunität', damageList(d.immunities)));
  if (d.conditionImmunities.length)
    out.push(line('Immunität', d.conditionImmunities.map((c) => CONDITIONS[c]).join(', ')));
  if (d.reduction) {
    const amount = d.reduction.amount === 'proficiency-bonus' ? 'Übungsbonus' : String(d.reduction.amount);
    out.push(line('Schaden', `${damageList(d.reduction.types)} sinkt um ${amount}`));
  }
  return out;
}

function resourceLines(item: DeclaringItem): DeclarationLine[] {
  const g = item.grantsResource;
  if (!g) return [];
  return [
    ...g.pools.map((p) => {
      const max = 'max' in p.shape && typeof p.shape.max === 'number' ? String(p.shape.max) : '';
      const rolled = p.rolled ? formatDamageDice(p.rolled) : '';
      return {
        label: 'Vorrat',
        text: join(`${p.labelDe || 'Ladungen'}:`, rolled || max, RECHARGE_DE[p.recharge] && `· ${RECHARGE_DE[p.recharge]}`),
      };
    }),
    ...g.mods.map((m) => ({
      label: 'Vorrat',
      text: m.noteDe?.trim()
        || join(typeof m.addMax === 'number' ? sign(m.addMax) : '', `auf den Vorrat „${m.target.pool}“ von ${m.target.feature}`),
    })),
  ];
}

function castingLines(item: DeclaringItem, spellLabel: (name: string) => string): DeclarationLine[] {
  const names = (item.grantsCasting?.quotas ?? []).flatMap((q) => q.pool.names ?? []);
  return names.length ? [{ label: 'Zauber', text: [...new Set(names)].map(spellLabel).join(', ') }] : [];
}

/** Reihenfolge = Kartenreihenfolge: was am Bogen rechnet, vor dem, was nur dort steht. */
export function itemDeclarationLines(
  item: DeclaringItem,
  opts: { spellLabel?: (name: string) => string } = {},
): DeclarationLine[] {
  const optionLabel = (v: string) => item.optionChoice?.options.find((o) => o.value === v)?.labelDe ?? v;
  return [
    ...(item.abilityEffects ?? []).map((e) => ({ label: 'Attribut', text: abilityEffectText(e) })),
    ...(item.armorClassEffects ?? []).map((e) => ({ label: 'RK', text: armorClassEffectText(e) })),
    ...(item.savingThrowEffects ?? []).map((e) => ({ label: 'Rettungswurf', text: savingThrowEffectText(e) })),
    ...(item.attackEffects ?? []).map((e) => ({ label: 'Angriff', text: attackEffectText(e) })),
    ...(item.defenses ?? []).flatMap((d) => defenseLines(d, optionLabel)),
    ...(item.resistanceChoice
      ? [{ label: 'Resistenz', text: `nach Wahl: ${damageList(item.resistanceChoice.types)}` }]
      : []),
    ...resourceLines(item),
    ...castingLines(item, opts.spellLabel ?? ((n) => n)),
    ...(item.slot ? [{ label: 'Platz', text: SLOT_LABEL_DE[item.slot] }] : []),
  ];
}
