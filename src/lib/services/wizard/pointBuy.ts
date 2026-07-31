/**
 * Point-Buy-Engine für die Charaktererstellung (SRD 5.2 / PHB 2024).
 *
 * Rein deterministisch, framework-frei, unit-testbar. Arbeitet auf den sechs
 * DEUTSCHEN Attribut-Schlüsseln des Charakters (`str/ges/kon/int/wei/cha`), weil
 * der Point-Buy VOR jeder Hintergrunds-Erhöhung greift und direkt in die
 * `Character`-Basiswerte fließt.
 *
 * Die Kosten sind die 2024er Punktekauf-Tabelle: Basiswert 8, Maximum 15 (VOR
 * Hintergrund-ASI), 27 Punkte Budget.
 */

import { ABILITY_KEYS, type AbilityKey, type AbilityScores } from '$lib/schemas/abilities';
export { ABILITY_KEYS, type AbilityKey, type AbilityScores };

export const POINT_BUY_BUDGET = 27;
export const POINT_BUY_MIN = 8;
export const POINT_BUY_MAX = 15;

/** Standard-Array (2024) als bequeme Alternative zum Punktekauf. */
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

/**
 * Punktekosten je Zielwert. Nur 8–15 sind im Punktekauf zulässig; alles außerhalb
 * ist `Infinity`, damit `remainingPoints` negativ/ungültig wird statt still zu raten.
 */
const COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

/** Alle Attribute auf dem Startwert 8. */
export function pointBuyStart(): AbilityScores {
  return { str: POINT_BUY_MIN, ges: POINT_BUY_MIN, kon: POINT_BUY_MIN, int: POINT_BUY_MIN, wei: POINT_BUY_MIN, cha: POINT_BUY_MIN };
}

/** Kosten eines einzelnen Wertes; außerhalb 8–15 → Infinity (ungültig). */
export function costOf(score: number): number {
  return COST[score] ?? Infinity;
}

/** Summe der ausgegebenen Punkte über alle sechs Attribute. */
export function pointsSpent(scores: AbilityScores): number {
  return ABILITY_KEYS.reduce((sum, k) => sum + costOf(scores[k]), 0);
}

/** Verbleibendes Budget (kann negativ werden, wenn zu viel ausgegeben wurde). */
export function remainingPoints(scores: AbilityScores): number {
  return POINT_BUY_BUDGET - pointsSpent(scores);
}

/** true, wenn ein Wert um `delta` verändert werden darf (Grenzen + Budget eingehalten). */
export function canAdjust(scores: AbilityScores, key: AbilityKey, delta: number): boolean {
  const next = scores[key] + delta;
  if (next < POINT_BUY_MIN || next > POINT_BUY_MAX) return false;
  const nextSpent = pointsSpent(scores) - costOf(scores[key]) + costOf(next);
  return nextSpent <= POINT_BUY_BUDGET;
}

/** Verändert einen Wert um `delta`, sofern erlaubt; sonst unverändert. */
export function adjust(scores: AbilityScores, key: AbilityKey, delta: number): AbilityScores {
  if (!canAdjust(scores, key, delta)) return scores;
  return { ...scores, [key]: scores[key] + delta };
}

/**
 * true, wenn die Belegung ein gültiger Punktekauf ist: jeder Wert 8–15 und genau
 * das Budget (oder weniger) ausgegeben. „Weniger" bleibt gültig, damit ein noch
 * nicht fertig verteilter Zustand nicht als Fehler, sondern als „unfertig" gilt.
 */
export function isValid(scores: AbilityScores): boolean {
  return ABILITY_KEYS.every((k) => scores[k] >= POINT_BUY_MIN && scores[k] <= POINT_BUY_MAX) && remainingPoints(scores) >= 0;
}

/** true, wenn das Budget vollständig ausgegeben ist (Wizard darf weiter). */
export function isComplete(scores: AbilityScores): boolean {
  return isValid(scores) && remainingPoints(scores) === 0;
}
