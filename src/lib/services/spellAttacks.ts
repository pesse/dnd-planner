/**
 * Zauber des Charakters als Angriffe: was die Angriffstabelle zur Wahl stellt, welche Zauber
 * Zusatzwürfel auf andere Angriffe legen, und die Zeile, die beim Wählen entsteht.
 */
import { z } from 'zod';
import { abilityKeyOf, type AbilityKey } from '../schemas/abilities';
import { attackEffectSchema, type AttackEffect } from '../schemas/attackEffect';
import { spellAttackSchema, type SpellAttack } from '../schemas/spellAttack';
import type { Attack } from '../schemas/characterSchema';
import type { SpellInfo, SpellIndex } from '../spellLibrary';
import type { SpellcastingState } from './spellcasting/state';
import type { AttackEffectSpell } from './attackEffects';
import { computeAttackBonus, computeAttackDamage, type AttackCalcContext } from './attackCalc';
import { spellDamageTypes, type SpellAttackContext, type SpellAttackSource } from './spellAttackCalc';

// Der Index reicht die Felder roh durch; geparst wird einmal je Eintrag.
const attacks = new WeakMap<object, SpellAttack | null>();
const riders = new WeakMap<object, AttackEffect[]>();
const ridersSchema = z.array(attackEffectSchema);

export function spellAttackOf(info: SpellInfo): SpellAttack | null {
  if (!attacks.has(info)) {
    const r = info.attack == null ? null : spellAttackSchema.safeParse(info.attack);
    attacks.set(info, r?.success ? r.data : null);
  }
  return attacks.get(info) ?? null;
}

export function spellRidersOf(info: SpellInfo): AttackEffect[] {
  if (!riders.has(info)) {
    const r = info.attackEffects == null ? null : ridersSchema.safeParse(info.attackEffects);
    riders.set(info, r?.success ? r.data : []);
  }
  return riders.get(info) ?? [];
}

export function spellAttackSourceOf(index: SpellIndex): SpellAttackContext['spellOf'] {
  return (key: string): SpellAttackSource | undefined => {
    const info = index.byKey.get(key);
    const attack = info && spellAttackOf(info);
    return attack ? { level: info.level, attack } : undefined;
  };
}

interface OwnedSpell {
  key: string;
  /** null = quellenlos (Homebrew-Extra) oder Attribut noch offen. */
  ability: AbilityKey | null;
  sourceLabel: string;
}

/** Jeder Zauber einmal, mit dem Attribut der ersten Quelle, die ihn führt. */
function ownedSpells(state: SpellcastingState): OwnedSpell[] {
  const seen = new Map<string, OwnedSpell>();
  for (const s of state.sources) {
    const ability = abilityKeyOf(s.ability) ?? null;
    for (const q of s.quotas) for (const key of q.spells) {
      if (!seen.has(key)) seen.set(key, { key, ability, sourceLabel: s.source.labelDe });
    }
  }
  for (const key of state.extra) if (!seen.has(key)) seen.set(key, { key, ability: null, sourceLabel: 'Ohne Quelle' });
  return [...seen.values()];
}

export interface SpellAttackOption extends OwnedSpell {
  info: SpellInfo;
}

export function spellAttackOptions(state: SpellcastingState, index: SpellIndex): SpellAttackOption[] {
  return ownedSpells(state)
    .flatMap((o) => {
      const info = index.byKey.get(o.key);
      return info && spellAttackOf(info) ? [{ ...o, info }] : [];
    })
    .sort((a, b) => a.info.level - b.info.level || a.info.name.localeCompare(b.info.name));
}

export function spellRiderSources(state: SpellcastingState, index: SpellIndex): AttackEffectSpell[] {
  return ownedSpells(state).flatMap((o) => {
    const info = index.byKey.get(o.key);
    const effects = info ? spellRidersOf(info) : [];
    return info && effects.length ? [{ name: info.name, effects }] : [];
  });
}

/** „27 Meter“ → „27 m“; die Spalte ist schmal. */
const shortRange = (range: string): string => range.replace(/\bMeter\b/g, 'm');

export function buildAttackFromSpell(info: SpellInfo, ability: AbilityKey, ctx: AttackCalcContext): Attack {
  const attack = spellAttackOf(info);
  const atk: Attack = {
    name: info.name,
    bonus: '', damage: '',
    type: attack ? spellDamageTypes(attack) : '',
    range: shortRange(info.range ?? ''),
    auto: true, modifiers: [],
    spell: { key: info.key ?? '', ability },
  };
  atk.bonus = computeAttackBonus(atk, ctx);
  atk.damage = computeAttackDamage(atk, ctx);
  return atk;
}

export const spellAttackIndexOf = (attacks: Attack[], key: string): number =>
  attacks.findIndex((a) => a.spell?.key === key);

/** Ohne Quelle (Homebrew-Extra) das stärkste Zauberattribut — änderbar in der Zeile. */
function abilityFor(o: SpellAttackOption, ctx: AttackCalcContext): AbilityKey {
  if (o.ability) return o.ability;
  const mods = ctx.spells?.mods;
  return (['int', 'wis', 'cha'] as const).reduce((best, k) => ((mods?.[k] ?? 0) > (mods?.[best] ?? 0) ? k : best));
}

export function toggleSpellAttack(attacks: Attack[], o: SpellAttackOption, ctx: AttackCalcContext): void {
  const at = spellAttackIndexOf(attacks, o.key);
  if (at >= 0) attacks.splice(at, 1);
  else attacks.push(buildAttackFromSpell(o.info, abilityFor(o, ctx), ctx));
}
