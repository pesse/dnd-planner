/**
 * Zauberzeilen der Angriffstabelle: Bonus bzw. SG und Schaden aus dem `attack`-Block des
 * verlinkten Zaubers, auf Charakterstufe und gewähltem Grad.
 */
import { ABILITY_ABBR_DE, type AbilityKey } from '../schemas/abilities';
import type { Attack } from '../schemas/characterSchema';
import type { SpellAttack } from '../schemas/spellAttack';
import { formatDamageDice } from '../itemFormat';
import { DAMAGE_TYPE_LABELS, damageTypeShort } from '../itemLabels';
import { sign } from '../utils/num';
import { attackEffectRows } from './attackEffects';
import type { AttackCalcContext, AttackPart, AttackParts } from './attackCalc';

export interface SpellAttackSource {
  level: number;
  attack: SpellAttack;
}

export interface SpellAttackContext {
  spellOf: (key: string) => SpellAttackSource | undefined;
  mods: Record<AbilityKey, number>;
  characterLevel: number;
}

/** Zaubertricks wachsen auf Charakterstufe 5, 11 und 17. */
export const cantripTier = (characterLevel: number): number =>
  characterLevel >= 17 ? 4 : characterLevel >= 11 ? 3 : characterLevel >= 5 ? 2 : 1;

export const castLevel = (a: Pick<Attack, 'spell'>, spell: SpellAttackSource): number =>
  spell.level === 0 ? 0 : Math.max(spell.level, a.spell?.slotLevel ?? spell.level);

export interface SpellHit {
  count: number;
  /** Würfel eines Treffers, Open5e-Schreibweise („2d6+1d8“). */
  dice: string;
  flat: number;
  addMod: boolean;
}

const scaleDice = (dice: string, factor: number): string =>
  dice.replace(/^(\d+)d(\d+)$/, (_, n, f) => `${Number(n) * factor}d${f}`);

/** Gleiche Würfelgröße wird zusammengezählt, sonst angehängt („2d6+1d8“). */
function addDice(dice: string, extra: string, times: number): string {
  const [, en, ef] = /^(\d+)d(\d+)$/.exec(extra) ?? [];
  if (!en || times <= 0) return dice;
  const add = Number(en) * times;
  const same = new RegExp(`(^|\\+)(\\d+)d${ef}(?=\\+|$)`);
  return same.test(dice)
    ? dice.replace(same, (_, pre, n) => `${pre}${Number(n) + add}d${ef}`)
    : `${dice}+${add}d${ef}`;
}

export function spellHit(spell: SpellAttackSource, characterLevel: number, level: number): SpellHit {
  const atk = spell.attack;
  let count = atk.count ?? 1;
  let parts = atk.damage.map((d) => d.dice);
  if (spell.level === 0) {
    const tier = cantripTier(characterLevel);
    if (atk.cantrip === 'count') count *= tier;
    else parts = parts.map((d) => scaleDice(d, tier));
  } else {
    const above = level - spell.level;
    if (atk.upcast?.count) count += atk.upcast.count * Math.max(0, above);
    const up = atk.upcast?.dice;
    if (up) {
      const faces = up.split('d')[1];
      const same = parts.map((d) => d.endsWith(`d${faces}`));
      parts = same.some(Boolean)
        ? parts.map((d, i) => (same[i] ? addDice(d, up, above) : d))
        : [addDice(parts[0], up, above), ...parts.slice(1)];
    }
  }
  return {
    count,
    dice: parts.join('+'),
    flat: atk.damage.reduce((n, d) => n + (d.bonus ?? 0), 0),
    addMod: atk.damage.some((d) => d.addMod),
  };
}

const ROLL_DE = { melee: 'Nahkampf-Zauberangriff', ranged: 'Fernkampf-Zauberangriff' } as const;

function rollNote(atk: SpellAttack): string {
  if (atk.roll === 'attack') return ROLL_DE[atk.range];
  if (atk.roll === 'auto') return 'Trifft ohne Wurf';
  return `Rettungswurf ${ABILITY_ABBR_DE[atk.save]}; gelungen: ${atk.onSave === 'half' ? 'halber Schaden' : 'kein Schaden'}`;
}

function upcastNote(spell: SpellAttackSource): string | null {
  const up = spell.attack.upcast;
  if (spell.level === 0 || !up) return null;
  const what = [up.dice && `+${formatDamageDice(up.dice)}`, up.count && `+${up.count}× Treffer`].filter(Boolean).join(', ');
  return `Höherer Grad: ${what} je Grad über ${spell.level}`;
}

function modifierParts(a: Attack, roll: 'attack' | 'damage'): AttackPart[] {
  const out: AttackPart[] = [];
  if (roll === 'attack' && a.magicBonus) out.push({ labelDe: 'Magie', value: a.magicBonus });
  for (const m of a.modifiers ?? []) {
    const value = (roll === 'attack' ? m.attackBonus : m.damageBonus) || 0;
    if (value) out.push({ labelDe: m.label.trim() || 'Effekt', value });
  }
  return out;
}

export function spellParts(
  a: Attack & { spell: NonNullable<Attack['spell']> },
  spell: SpellAttackSource,
  ctx: AttackCalcContext & { spells: SpellAttackContext },
  roll: 'attack' | 'damage',
): AttackParts {
  const ability = a.spell.ability;
  const mod = { labelDe: ABILITY_ABBR_DE[ability], value: ctx.spells.mods[ability] ?? 0 };
  const declared = attackEffectRows(a, ctx.declared, ctx.proficiencyBonus, spell.attack);
  const fromDeclared = declared.rows.filter((r) => r[roll]).map((r) => ({ labelDe: r.labelDe, value: r[roll] }));

  if (roll === 'attack') {
    const atk = spell.attack;
    const notes = [rollNote(atk), ...declared.attackNotes];
    if (atk.roll === 'auto') return { parts: [], notes };
    const base = atk.roll === 'save' ? [{ labelDe: 'Grundwert', value: 8 }] : [];
    return {
      parts: [...base, mod, { labelDe: 'geübt', value: ctx.proficiencyBonus }, ...modifierParts(a, 'attack'), ...fromDeclared],
      notes,
    };
  }
  const hit = spellHit(spell, ctx.spells.characterLevel, castLevel(a, spell));
  const upcast = upcastNote(spell);
  return {
    parts: [...(hit.addMod ? [mod] : []), ...modifierParts(a, 'damage'), ...fromDeclared],
    notes: [...(upcast ? [upcast] : []), ...declared.damageNotes],
  };
}

const partSum = (p: AttackParts): number => p.parts.reduce((n, x) => n + x.value, 0);

export function spellBonusText(atk: SpellAttack, parts: AttackParts): string {
  if (atk.roll === 'auto') return 'trifft';
  if (atk.roll === 'attack') return sign(partSum(parts));
  return `SG ${partSum(parts)} ${ABILITY_ABBR_DE[atk.save]}`;
}

/** „3× 2W6+1“ — die Würfel eines Treffers, davor die Anzahl. */
export function spellDamageText(hit: SpellHit, parts: AttackParts): string {
  const flat = hit.flat + partSum(parts);
  const one = formatDamageDice(hit.dice) + (flat !== 0 ? sign(flat) : '');
  return hit.count > 1 ? `${hit.count}× ${one}` : one;
}

export function spellDamageTypes(atk: SpellAttack): string {
  return [...new Set(atk.damage.map((d) => (d.type ? damageTypeShort(DAMAGE_TYPE_LABELS[d.type]) : 'nach Wahl')))].join('/');
}

/** Steckbrief-Zeile der Zauberkarte: Wurf und Schaden auf dem Grad des Zaubers, Stufe-1-Charakter. */
export function spellAttackSummary(level: number, atk: SpellAttack): string {
  const spell = { level, attack: atk };
  const hit = spellHit(spell, 1, level);
  const damage = spellDamageText(hit, { parts: [], notes: [] });
  const extras = [hit.addMod && '+ Zauberattribut', upcastNote(spell)].filter(Boolean);
  return [`${damage} ${spellDamageTypes(atk)}`, rollNote(atk), ...extras].join(' · ');
}
