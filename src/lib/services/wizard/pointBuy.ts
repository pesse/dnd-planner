/**
 * Punktekauf-Tabelle 2024 (Basis 8, Maximum 15, 27 Punkte) — er greift VOR jeder
 * Hintergrunds-Erhöhung und fließt direkt in `character.abilities`.
 */

import { ABILITY_KEYS, type AbilityKey, type AbilityScores } from '$lib/schemas/abilities';
export { ABILITY_KEYS, type AbilityKey, type AbilityScores };

export const POINT_BUY_BUDGET = 27;
export const POINT_BUY_MIN = 8;
export const POINT_BUY_MAX = 15;

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

/** Außerhalb 8–15 `Infinity`, damit `remainingPoints` ungültig wird statt still zu raten. */
const COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

export function pointBuyStart(): AbilityScores {
  return { str: POINT_BUY_MIN, dex: POINT_BUY_MIN, con: POINT_BUY_MIN, int: POINT_BUY_MIN, wis: POINT_BUY_MIN, cha: POINT_BUY_MIN };
}

export function costOf(score: number): number {
  return COST[score] ?? Infinity;
}

export function pointsSpent(scores: AbilityScores): number {
  return ABILITY_KEYS.reduce((sum, k) => sum + costOf(scores[k]), 0);
}

export function remainingPoints(scores: AbilityScores): number {
  return POINT_BUY_BUDGET - pointsSpent(scores);
}

export function canAdjust(scores: AbilityScores, key: AbilityKey, delta: number): boolean {
  const next = scores[key] + delta;
  if (next < POINT_BUY_MIN || next > POINT_BUY_MAX) return false;
  const nextSpent = pointsSpent(scores) - costOf(scores[key]) + costOf(next);
  return nextSpent <= POINT_BUY_BUDGET;
}

export function adjust(scores: AbilityScores, key: AbilityKey, delta: number): AbilityScores {
  if (!canAdjust(scores, key, delta)) return scores;
  return { ...scores, [key]: scores[key] + delta };
}

/** Übriges Budget bleibt gültig — ein unfertig verteilter Zustand ist kein Fehler. */
export function isValid(scores: AbilityScores): boolean {
  return ABILITY_KEYS.every((k) => scores[k] >= POINT_BUY_MIN && scores[k] <= POINT_BUY_MAX) && remainingPoints(scores) >= 0;
}

export function isComplete(scores: AbilityScores): boolean {
  return isValid(scores) && remainingPoints(scores) === 0;
}
