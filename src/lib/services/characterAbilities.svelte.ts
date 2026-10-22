/** Wirksame Attribute zum aktuellen Inventar — Editor (Formularstand) und Bogen (Draft) lesen dasselbe. */
import { abilityRecordOf, type AbilityKey, type AbilityScores } from '../schemas/abilities';
import type { CharacterInventoryEntry } from '../schemas/characterSchema';
import type { ItemIndex } from '../itemLibrary';
import { resolveScore, wornAbilityEffects, type AbilityResolution, type WornAbilityEffect } from './effectiveAbilities';
import { wornItemsIn } from './wornItems';

export interface CharacterAbilities {
  /** null, solange die Item-Bibliothek lädt. */
  readonly loadedEffects: readonly WornAbilityEffect[] | null;
  readonly effects: readonly WornAbilityEffect[];
  readonly resolved: Record<AbilityKey, AbilityResolution>;
}

export function createCharacterAbilities(
  input: () => { abilities: AbilityScores; inventory: CharacterInventoryEntry[] } | null,
  items: () => { readonly itemIndex: ItemIndex; readonly itemsLoaded: boolean },
): CharacterAbilities {
  const loadedEffects = $derived.by(() => {
    const c = input();
    const lib = items();
    return lib.itemsLoaded && c ? wornAbilityEffects(wornItemsIn(lib.itemIndex, c.inventory)) : null;
  });
  const effects = $derived(loadedEffects ?? []);
  const resolved = $derived.by(() => {
    const base = input()?.abilities;
    return abilityRecordOf((k) => resolveScore(base?.[k] ?? 10, effects, k));
  });
  return {
    get loadedEffects() { return loadedEffects; },
    get effects() { return effects; },
    get resolved() { return resolved; },
  };
}
