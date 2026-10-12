/**
 * Die eine Auswertung von `amountSchema`. Welche Stufe `level` trägt, entscheidet der Aufrufer:
 * Klassenmerkmal → KLASSEN-Stufe, Trait und Talent → CHARAKTER-Stufe.
 */
import { abilityKeyOf, type AbilityKey } from '$lib/schemas/abilities';
import type { Amount, AmountTerm } from '$lib/schemas/amount';
import { firstInt } from '$lib/utils/num';

export interface AmountContext {
  level: number;
  profBonus: number;
  mods: Record<AbilityKey, number>;
  column: (name: string) => string | undefined;
}

/** Der Wert der höchsten erreichten Stufe; `undefined` unterhalb der ersten. */
export function levelStep<T>(steps: Record<string, T>, level: number): T | undefined {
  const reached = Object.keys(steps)
    .map(Number)
    .filter((l) => l <= level)
    .sort((a, b) => b - a)[0];
  return reached === undefined ? undefined : steps[String(reached)];
}

export function resolveAmount(amount: Amount, ctx: AmountContext): number {
  if (typeof amount === 'object' && 'sum' in amount)
    return amount.sum.reduce<number>((n, term) => n + resolveTerm(term, ctx), 0);
  return resolveTerm(amount, ctx);
}

function resolveTerm(amount: AmountTerm, ctx: AmountContext): number {
  if (typeof amount === 'number') return amount;
  if (amount === 'proficiency-bonus') return ctx.profBonus;
  if ('column' in amount) return firstInt(ctx.column(amount.column));
  if ('byLevel' in amount) return levelStep(amount.byLevel, ctx.level) ?? 0;
  if ('abilityMod' in amount) {
    const mod = ctx.mods[abilityKeyOf(amount.abilityMod) ?? 'str'] ?? 0;
    return Math.max(amount.min, mod);
  }
  const total = amount.base + amount.perLevel * Math.max(0, ctx.level - 1);
  const scaled = total / amount.divide;
  return amount.round === 'up' ? Math.ceil(scaled) : Math.floor(scaled);
}
