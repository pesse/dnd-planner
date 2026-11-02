/** Initiative-Reihenfolge und Zugwechsel einer Karte. */
import type { Combat, Token } from '../../schemas/battleMap';
import { mod } from '../../domain/skills';
import type { Monster } from '../../types';
import { loadTokenMonster } from './tokenDetails';

type Combatant = Pick<Token, 'id' | 'name' | 'initiative' | 'hp'>;

/** Höchste Initiative zuerst; Gleichstand nach Name, damit die Reihenfolge stabil bleibt. */
export function initiativeOrder<T extends Combatant>(tokens: T[]): T[] {
  return tokens
    .filter((t) => t.initiative != null)
    .sort((a, b) => b.initiative! - a.initiative! || a.name.localeCompare(b.name, 'de'));
}

/** Besiegte (0 TP) bleiben in der Liste, kommen aber nicht mehr an die Reihe. */
export function advanceTurn(tokens: Combatant[], combat: Combat, step: 1 | -1): Combat {
  const order = initiativeOrder(tokens).filter((t) => t.hp !== 0);
  if (!order.length) return combat;
  const i = order.findIndex((t) => t.id === combat.turn);
  if (i < 0) return { round: Math.max(1, combat.round), turn: order[0].id };
  const j = i + step;
  if (j >= order.length) return { round: combat.round + 1, turn: order[0].id };
  if (j < 0) return combat.round > 1 ? { round: combat.round - 1, turn: order.at(-1)!.id } : combat;
  return { round: combat.round, turn: order[j].id };
}

export const startCombat = (tokens: Combatant[]): Combat => advanceTurn(tokens, { round: 1, turn: '' }, 1);

export const rollInitiative = (monster: Monster, random: () => number = Math.random): number =>
  1 + Math.floor(random() * 20) + mod(monster.ability_scores.dex);

/** Würfelt für alle Monster ohne Initiative; ein Monster mehrfach auf der Karte wird nur einmal geladen. */
export async function rollMonsterInitiatives(tokens: Token[], campaignDir: string): Promise<Record<string, number>> {
  const cache = new Map<string, Promise<Monster | null>>();
  const result: Record<string, number> = {};
  for (const t of tokens) {
    if (t.kind !== 'monster' || t.initiative != null || !t.ref) continue;
    const key = `${t.encounter}|${t.ref}`;
    if (!cache.has(key)) cache.set(key, loadTokenMonster(t, campaignDir));
    const monster = await cache.get(key)!;
    if (monster) result[t.id] = rollInitiative(monster);
  }
  return result;
}
