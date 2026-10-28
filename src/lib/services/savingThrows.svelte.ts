/** Rettungswürfe und Auren zum aktuellen Stand; bis Bibliothek und Merkmale geladen sind, ohne deklarierte Zuschläge. */
import { abilityRecordOf, type AbilityKey } from '../schemas/abilities';
import type { Character } from '../schemas/characterSchema';
import type { ItemIndex } from '../itemLibrary';
import { mod } from '../domain/skills';
import { characterAuras, type CharacterAura } from './auras';
import { effectiveProficiencyBonus } from './classProgression';
import type { AbilityResolution } from './effectiveAbilities';
import type { OwnedGrantFeature } from './hitPoints';
import { savingThrowDerivations, savingThrowSources, type SavingThrowDerivation } from './savingThrows';
import { idleItemsIn, wornItemsIn } from './wornItems';

type SaveInput = Pick<Character, 'saveProfs' | 'proficiencyBonus' | 'classes' | 'inventory'>;

export function createSavingThrows(
  input: () => SaveInput | null,
  items: () => { readonly itemIndex: ItemIndex; readonly itemsLoaded: boolean },
  abilities: () => Record<AbilityKey, AbilityResolution>,
  /** `createOwnedGrantFeatures`; null, solange sie laden. */
  features: () => readonly OwnedGrantFeature[] | null,
): { readonly saves: Record<AbilityKey, SavingThrowDerivation> | null; readonly auras: CharacterAura[] } {
  const result = $derived.by(() => {
    const c = input();
    if (!c) return { saves: null, auras: [] };
    const resolved = abilities();
    const mods = abilityRecordOf((k) => mod(resolved[k].score));
    const lib = items();
    const owned = features();
    const auras = owned ? characterAuras(owned, { mods, profBonus: effectiveProficiencyBonus(c) }) : [];
    const ready = lib.itemsLoaded && !!owned;
    const saves = savingThrowDerivations({
      mods,
      profBonus: effectiveProficiencyBonus(c),
      saveProfs: c.saveProfs,
      sources: ready ? savingThrowSources(wornItemsIn(lib.itemIndex, c.inventory ?? []), owned, auras) : [],
      idle: ready ? idleItemsIn(lib.itemIndex, c.inventory ?? []) : [],
    });
    return { saves, auras };
  });
  return {
    get saves() { return result.saves; },
    get auras() { return result.auras; },
  };
}
