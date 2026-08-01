/**
 * Angriffswerte im Auto-Modus: Bonus, Schaden, Herleitungs-Tooltips und die
 * Vergleichsform fürs Diff-Highlighting. Rein — die Attributsmodifikatoren und
 * der Übungsbonus kommen als `AttackCalcContext` herein.
 */
import { sign } from '../utils/num';
import { formatDamageDice, ftToMVal } from '../itemFormat';
import { DAMAGE_TYPE_LABELS } from '../itemLabels';
import type { Attack } from '../schemas/characterSchema';
import type { Item } from '../types';

export interface AttackCalcContext {
  strMod: number;
  gesMod: number;
  proficiencyBonus: number;
}

export interface WeaponAttackContext extends AttackCalcContext {
  simpleWeapons: boolean;
  martialWeapons: boolean;
}

const ABILITY_LABEL: Record<string, string> = { str: 'STR', ges: 'GES', finesse: 'Finesse' };

export function attackAbilityMod(a: Pick<Attack, 'ability'>, ctx: AttackCalcContext): number {
  if (a.ability === 'ges') return ctx.gesMod;
  if (a.ability === 'finesse') return Math.max(ctx.strMod, ctx.gesMod);
  return ctx.strMod;
}

/** Summe der benannten Zusatzeffekte, getrennt nach Angriffswurf und Schaden. */
export function attackModifierTotals(a: Attack): { attack: number; damage: number } {
  let attack = 0, damage = 0;
  for (const m of a.modifiers ?? []) {
    attack += m.attackBonus || 0;
    damage += m.damageBonus || 0;
  }
  return { attack, damage };
}

/** Angriffsbonus = Attributsmod + (geübt ? Übungsbonus) + magischer Bonus + Zusatzeffekte. */
export function computeAttackBonus(a: Attack, ctx: AttackCalcContext): string {
  return sign(attackAbilityMod(a, ctx) + (a.proficient ? ctx.proficiencyBonus : 0)
    + (a.magicBonus ?? 0) + attackModifierTotals(a).attack);
}

/** Schaden = Würfel + Attributsmod + magischer Bonus + Zusatzeffekte (Übungsbonus zählt NICHT). */
export function computeAttackDamage(a: Attack, ctx: AttackCalcContext): string {
  const base = (a.baseDamage ?? '').trim();
  if (!base) return '';
  const m = attackAbilityMod(a, ctx) + (a.magicBonus ?? 0) + attackModifierTotals(a).damage;
  return base + (m !== 0 ? sign(m) : '');
}

/**
 * Mehrzeilige Herleitung fürs `title`-Attribut der berechneten Zellen. Bewusst Plaintext:
 * das HTML-Tooltip-System (`row`/`total`) liegt im Charakterbogen.
 */
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
 * Vergleichsform fürs Diff-Highlighting. Zwei Angleichungen, ohne die eine Zeile nach
 * dem Speichern dauerhaft grün bliebe:
 *  - leeres `modifiers` gilt wie keins (gespeichert wird der Schlüssel dann nicht),
 *  - im Auto-Modus sind `bonus`/`damage` abgeleitet: der State trägt noch den Text vom
 *    Anlegen, in die Datei geht der berechnete Wert. Beide Seiten neu rechnen.
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

/** Speicherform eines Angriffs: berechnete Werte einfrieren, leere Effektzeilen fallen weg. */
export function attackForSave(a: Attack, ctx: AttackCalcContext): Attack {
  const modifiers = (a.modifiers ?? [])
    .filter((m) => m.label.trim() !== '' || m.attackBonus !== 0 || m.damageBonus !== 0)
    .map((m) => ({ ...m }));
  const out = a.auto
    ? { ...a, bonus: computeAttackBonus(a, ctx), damage: computeAttackDamage(a, ctx) }
    : { ...a };
  // Leeres `modifiers` NICHT schreiben: sonst bekäme jede Waffe ohne Effekte den
  // Schlüssel, und der Diff gegen den geladenen Stand bliebe dauerhaft „geändert".
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

/**
 * Baut einen Attack-Eintrag aus einem Waffen-Item der Bibliothek. Wählt das Attribut nach
 * Reichweite/Finesse, übernimmt Waffenübung, Schadenswürfel und magischen Bonus
 * (`item.magic_bonus`); Bonus/Schaden werden danach reaktiv berechnet (`auto = true`).
 */
export function buildAttackFromWeapon(item: Item, ctx: WeaponAttackContext): Attack {
  const name = item.name_de ?? item.name;
  const isRanged = item.weapon_range === 'Ranged';
  const isFinesse = (item.properties ?? []).some((p) => p.index === 'finesse');
  const ability: Attack['ability'] = isRanged ? 'ges' : (isFinesse ? 'finesse' : 'str');

  const proficient = (item.weapon_category === 'Simple' && ctx.simpleWeapons) ||
                     (item.weapon_category === 'Martial' && ctx.martialWeapons);

  const baseDamage = item.damage?.damage_dice ? formatDamageDice(item.damage.damage_dice) : '';
  const magicBonus = item.magic_bonus ?? 0;

  const damageTypeIdx = item.damage?.damage_type?.index ?? '';
  const damageTypeLabel = DAMAGE_TYPE_LABELS[damageTypeIdx] ?? item.damage?.damage_type?.name ?? '';
  // Kurzform für PDF-Spalte: "Hieb" / "Stich" / "Wucht"
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

/** Schaltet einen Angriff zwischen reaktiver Berechnung und manueller Eingabe um (mutiert). */
export function toggleAttackMode(a: Attack, ctx: AttackCalcContext): void {
  if (a.auto) {
    // → manuell: aktuelle Werte als Freitext einfrieren
    a.bonus = computeAttackBonus(a, ctx);
    a.damage = computeAttackDamage(a, ctx);
    a.auto = false;
    return;
  }
  // → auto: Felder initialisieren, Würfel aus vorhandenem Schaden ableiten
  a.ability ??= 'str';
  a.proficient ??= false;
  a.magicBonus ??= 0;
  a.modifiers ??= [];
  if (a.baseDamage == null || a.baseDamage === '') {
    const m = a.damage.match(/^\s*(\d*\s*[WwDd]\s*\d+)/);
    a.baseDamage = m ? m[1].replace(/\s/g, '').replace(/[dD]/, 'W') : '';
  }
  a.auto = true;
}
