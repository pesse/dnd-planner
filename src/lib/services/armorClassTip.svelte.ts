/** Die RK-Herleitung zum aktuellen Stand — Editor (Formularstand) und Bogen (Draft) lesen dasselbe. */
import { abilityRecordOf, type AbilityKey } from '../schemas/abilities';
import type { Character } from '../schemas/characterSchema';
import type { ItemIndex } from '../itemLibrary';
import { mod } from '../domain/skills';
import { armorClassDerivation, type ArmorClassFeature } from './armorClass';
import { acTip } from './characterSheetTips';
import type { AbilityResolution } from './effectiveAbilities';
import { idleItemsIn, wornItemsIn } from './wornItems';

type AcInput = Pick<Character, 'ac' | 'inventory' | 'combatAdjustments'>;

export function createArmorClassTip(
  input: () => AcInput | null,
  items: () => { readonly itemIndex: ItemIndex; readonly itemsLoaded: boolean },
  abilities: () => Record<AbilityKey, AbilityResolution>,
  /** `createOwnedGrantFeatures`; null, solange sie laden. */
  features: () => readonly ArmorClassFeature[] | null,
): { readonly html: string; readonly total: number | null } {
  const derivation = $derived.by(() => {
    const c = input();
    const lib = items();
    const owned = features();
    if (!c || !owned || !lib.itemsLoaded) return null;
    const resolved = abilities();
    return armorClassDerivation({
      ac: c.ac,
      worn: wornItemsIn(lib.itemIndex, c.inventory ?? []),
      idle: idleItemsIn(lib.itemIndex, c.inventory ?? []),
      features: owned,
      mods: abilityRecordOf((k) => mod(resolved[k].score)),
      adjustments: c.combatAdjustments?.ac,
    });
  });
  const html = $derived(derivation ? acTip(derivation) : '');
  return {
    get html() { return html; },
    /** null, solange Bibliotheken und Merkmale laden. */
    get total() { return derivation?.total ?? null; },
  };
}
