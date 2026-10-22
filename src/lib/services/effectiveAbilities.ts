/**
 * Wirksame Attributswerte: der Grundwert aus der Datei, verändert durch wirkende Gegenstände
 * (`abilityEffects`). Die Wirkungen bleiben vom Grundwert getrennt, weil eine Erhöhung (ASI) auf
 * den Grundwert wirkt und erst danach `set` und `add` greifen.
 */
import { abilityRecordOf, type AbilityKey, type AbilityScores } from '$lib/schemas/abilities';
import type { CharacterInventoryEntry } from '$lib/schemas/characterSchema';
import type { AbilityEffect } from '$lib/schemas/item';
import { mod } from '../domain/skills';
import { cappedScore } from './declaration/abilityIncrease';
import { wornItems, type WornItem } from './wornItems';

export interface WornAbilityEffect {
  /** `WornItem.id` des Gegenstands, der die Wirkung trägt. */
  itemId: string;
  labelDe: string;
  effect: AbilityEffect;
}

export const wornAbilityEffects = (worn: WornItem[]): WornAbilityEffect[] =>
  worn.flatMap(({ id, item }) =>
    (item.abilityEffects ?? []).map((effect) => ({ itemId: id, labelDe: item.name_de?.trim() || item.name, effect })),
  );

/** Ein Gegenstand, der das Attribut betrifft — `applied: false`, wo er nichts ändert. */
export interface AbilityStep {
  labelDe: string;
  kind: AbilityEffect['kind'];
  value: number;
  applied: boolean;
}

export interface AbilityResolution {
  base: number;
  score: number;
  steps: AbilityStep[];
}

export function resolveScore(base: number, effects: readonly WornAbilityEffect[], key: AbilityKey): AbilityResolution {
  const sets = effects.filter((e) => e.effect.kind === 'set' && e.effect.ability === key);
  let score = base;
  let winner: WornAbilityEffect | undefined;
  for (const e of sets)
    if (e.effect.value > score) {
      score = e.effect.value;
      winner = e;
    }
  const steps: AbilityStep[] = sets.map((e) => ({ labelDe: e.labelDe, kind: 'set', value: e.effect.value, applied: e === winner }));

  for (const e of effects) {
    const { effect } = e;
    if (effect.kind !== 'add' || effect.ability !== key) continue;
    const applies = !effect.onSetBy.length || (!!winner && effect.onSetBy.includes(winner.itemId));
    const before = score;
    if (applies) score = cappedScore(score, effect.value, effect.max);
    steps.push({ labelDe: e.labelDe, kind: 'add', value: effect.value, applied: score !== before });
  }
  return { base, score, steps };
}

export const effectiveScore = (base: number, effects: readonly WornAbilityEffect[], key: AbilityKey): number =>
  resolveScore(base, effects, key).score;

export const effectiveScores = (base: AbilityScores, effects: readonly WornAbilityEffect[]): AbilityScores =>
  abilityRecordOf((k) => effectiveScore(base[k], effects, k));

export const effectiveMods = (base: AbilityScores, effects: readonly WornAbilityEffect[]): AbilityScores =>
  abilityRecordOf((k) => mod(effectiveScore(base[k], effects, k)));

export async function loadWornAbilityEffects(inventory: CharacterInventoryEntry[]): Promise<WornAbilityEffect[]> {
  return wornAbilityEffects(await wornItems(inventory));
}
