/**
 * Angriffswerte im Auto-Modus: Bonus, Schaden, Herleitungs-Tooltips, Vergleichsform.
 * Rein — Attributsmodifikatoren und Übungsbonus kommen als `AttackCalcContext` herein.
 */
import { sign } from '../utils/num';
import { formatDamageDice, ftToMVal } from '../itemFormat';
import { DAMAGE_TYPE_LABELS } from '../itemLabels';
import { isProficientWithWeapon, type WeaponProficiencies } from './weaponProficiency';
import type { Attack } from '../schemas/characterSchema';
import type { Item } from '../types';

export interface AttackCalcContext {
  strMod: number;
  gesMod: number;
  proficiencyBonus: number;
}

export interface WeaponAttackContext extends AttackCalcContext {
  proficiencies: WeaponProficiencies;
  /** Löst einen erklärten Waffennamen zur Waffenart auf, damit auch magische Stücke greifen. */
  weaponByName?: (name: string) => { index?: string } | undefined;
}

const ABILITY_LABEL: Record<string, string> = { str: 'STR', ges: 'GES', finesse: 'Finesse' };

export function attackAbilityMod(a: Pick<Attack, 'ability'>, ctx: AttackCalcContext): number {
  if (a.ability === 'ges') return ctx.gesMod;
  if (a.ability === 'finesse') return Math.max(ctx.strMod, ctx.gesMod);
  return ctx.strMod;
}

export function attackModifierTotals(a: Attack): { attack: number; damage: number } {
  let attack = 0, damage = 0;
  for (const m of a.modifiers ?? []) {
    attack += m.attackBonus || 0;
    damage += m.damageBonus || 0;
  }
  return { attack, damage };
}

export function computeAttackBonus(a: Attack, ctx: AttackCalcContext): string {
  return sign(attackAbilityMod(a, ctx) + (a.proficient ? ctx.proficiencyBonus : 0)
    + (a.magicBonus ?? 0) + attackModifierTotals(a).attack);
}

/** Der Übungsbonus zählt hier NICHT mit — nur beim Angriffswurf. */
export function computeAttackDamage(a: Attack, ctx: AttackCalcContext): string {
  const base = (a.baseDamage ?? '').trim();
  if (!base) return '';
  const m = attackAbilityMod(a, ctx) + (a.magicBonus ?? 0) + attackModifierTotals(a).damage;
  return base + (m !== 0 ? sign(m) : '');
}

/** Plaintext fürs `title`-Attribut — das HTML-Tooltip-System liegt im Charakterbogen. */
export function attackBonusTip(a: Attack, ctx: AttackCalcContext): string {
  const lines = [`${ABILITY_LABEL[a.ability ?? 'str']} ${sign(attackAbilityMod(a, ctx))}`];
  if (a.proficient) lines.push(`geübt ${sign(ctx.proficiencyBonus)}`);
  if (a.magicBonus) lines.push(`Magie ${sign(a.magicBonus)}`);
  for (const m of a.modifiers ?? [])
    if (m.attackBonus) lines.push(`${m.label.trim() || 'Effekt'} ${sign(m.attackBonus)}`);
  return [...lines, `= ${computeAttackBonus(a, ctx)}`].join('\n');
}

export function attackDamageTip(a: Attack, ctx: AttackCalcContext): string {
  const base = (a.baseDamage ?? '').trim();
  if (!base) return 'Kein Schadenswürfel eingetragen';
  const lines = [`Würfel ${base}`, `${ABILITY_LABEL[a.ability ?? 'str']} ${sign(attackAbilityMod(a, ctx))}`];
  if (a.magicBonus) lines.push(`Magie ${sign(a.magicBonus)}`);
  for (const m of a.modifiers ?? [])
    if (m.damageBonus) lines.push(`${m.label.trim() || 'Effekt'} ${sign(m.damageBonus)}`);
  return [...lines, `= ${computeAttackDamage(a, ctx)}`].join('\n');
}

/**
 * Zwei Angleichungen, ohne die eine Zeile nach dem Speichern dauerhaft grün bliebe:
 * leeres `modifiers` gilt wie keins, und im Auto-Modus trägt der State noch den Text
 * vom Anlegen, während in die Datei der berechnete Wert geht.
 */
export function attackForDiff(a: Attack, ctx: AttackCalcContext): Attack {
  const r = { ...a };
  if (!r.modifiers?.length) delete r.modifiers;
  if (r.auto) {
    r.bonus = computeAttackBonus(r, ctx);
    r.damage = computeAttackDamage(r, ctx);
  }
  return r;
}

export function attackForSave(a: Attack, ctx: AttackCalcContext): Attack {
  const modifiers = (a.modifiers ?? [])
    .filter((m) => m.label.trim() !== '' || m.attackBonus !== 0 || m.damageBonus !== 0)
    .map((m) => ({ ...m }));
  const out = a.auto
    ? { ...a, bonus: computeAttackBonus(a, ctx), damage: computeAttackDamage(a, ctx) }
    : { ...a };
  // Leeres `modifiers` NICHT schreiben, sonst bliebe der Diff gegen den geladenen
  // Stand für jede Waffe ohne Effekte dauerhaft „geändert".
  if (modifiers.length) out.modifiers = modifiers;
  else delete out.modifiers;
  return out;
}

export function blankAttack(): Attack {
  return {
    name: '', bonus: '', damage: '', type: '', range: '',
    auto: true, ability: 'str', proficient: false, baseDamage: '', magicBonus: 0, modifiers: [],
  };
}

export function buildAttackFromWeapon(item: Item, ctx: WeaponAttackContext): Attack {
  const name = item.name_de ?? item.name;
  const isRanged = item.weapon_range === 'Ranged';
  const isFinesse = (item.properties ?? []).some((p) => p.index === 'finesse');
  const ability: Attack['ability'] = isRanged ? 'ges' : (isFinesse ? 'finesse' : 'str');

  const proficient = isProficientWithWeapon(ctx.proficiencies, item, ctx.weaponByName);

  const baseDamage = item.damage?.damage_dice ? formatDamageDice(item.damage.damage_dice) : '';
  const magicBonus = item.magic_bonus ?? 0;

  const damageTypeIdx = item.damage?.damage_type?.index ?? '';
  const damageTypeLabel = DAMAGE_TYPE_LABELS[damageTypeIdx] ?? item.damage?.damage_type?.name ?? '';
  // Die PDF-Spalte ist schmal und will die Kurzform: „Hieb" statt „Hiebschaden".
  const damageTypeShort = damageTypeLabel.replace(/schaden$/i, '').trim();

  let range = '';
  if (isRanged && item.range) {
    const n = ftToMVal(item.range.normal);
    const l = item.range.long ? ftToMVal(item.range.long) : null;
    range = l ? `${n}/${l} m` : `${n} m`;
  } else if (item.throw_range) {
    const n = ftToMVal(item.throw_range.normal);
    const l = ftToMVal(item.throw_range.long);
    range = `Nah (Wurf ${n}/${l} m)`;
  } else {
    range = 'Nah';
  }

  const atk: Attack = {
    name, bonus: '', damage: '', type: damageTypeShort, range,
    auto: true, ability, proficient, baseDamage, magicBonus, modifiers: [],
  };
  atk.bonus = computeAttackBonus(atk, ctx);
  atk.damage = computeAttackDamage(atk, ctx);
  return atk;
}

/** Mutiert `a` in place — der Aufrufer hält das Angriffsobjekt reaktiv. */
export function toggleAttackMode(a: Attack, ctx: AttackCalcContext): void {
  if (a.auto) {
    // Nach manuell: die berechneten Werte als Freitext einfrieren, sonst stünde dort nichts.
    a.bonus = computeAttackBonus(a, ctx);
    a.damage = computeAttackDamage(a, ctx);
    a.auto = false;
    return;
  }
  a.ability ??= 'str';
  a.proficient ??= false;
  a.magicBonus ??= 0;
  a.modifiers ??= [];
  if (a.baseDamage == null || a.baseDamage === '') {
    // Rückweg nach auto: den Würfel aus dem eingefrorenen Freitext zurückgewinnen.
    const m = a.damage.match(/^\s*(\d*\s*[WwDd]\s*\d+)/);
    a.baseDamage = m ? m[1].replace(/\s/g, '').replace(/[dD]/, 'W') : '';
  }
  a.auto = true;
}
