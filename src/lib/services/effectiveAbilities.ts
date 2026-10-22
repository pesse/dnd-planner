/**
 * Wirksame Attributswerte: der Grundwert aus der Datei, verändert durch wirkende Gegenstände
 * (`abilityEffects`). Die Wirkungen bleiben vom Grundwert getrennt, weil eine Erhöhung (ASI) auf
 * den Grundwert wirkt und erst danach `set` und `add` greifen.
 */
import { abilityRecordOf, type AbilityKey, type AbilityScores } from '$lib/schemas/abilities';
import type { CharacterInventoryEntry } from '$lib/schemas/characterSchema';
import type { AbilityEffect } from '$lib/schemas/item';
import { cappedScore } from './declaration/abilityIncrease';
import { wornItems, type WornItem } from './wornItems';

export interface WornAbilityEffect {
  /** `WornItem.id` des Gegenstands, der die Wirkung trägt. */
  itemId: string;
  effect: AbilityEffect;
}

export const wornAbilityEffects = (worn: WornItem[]): WornAbilityEffect[] =>
  worn.flatMap(({ id, item }) => (item.abilityEffects ?? []).map((effect) => ({ itemId: id, effect })));

export function effectiveScore(base: number, effects: readonly WornAbilityEffect[], key: AbilityKey): number {
  let value = base;
  let setBy = '';
  for (const { itemId, effect } of effects)
    if (effect.kind === 'set' && effect.ability === key && effect.value > value) {
      value = effect.value;
      setBy = itemId;
    }
  for (const { effect } of effects)
    if (effect.kind === 'add' && effect.ability === key && (!effect.onSetBy.length || effect.onSetBy.includes(setBy)))
      value = cappedScore(value, effect.value, effect.max);
  return value;
}

export const effectiveScores = (base: AbilityScores, effects: readonly WornAbilityEffect[]): AbilityScores =>
  abilityRecordOf((k) => effectiveScore(base[k], effects, k));

export async function loadWornAbilityEffects(inventory: CharacterInventoryEntry[]): Promise<WornAbilityEffect[]> {
  return wornAbilityEffects(await wornItems(inventory));
}
