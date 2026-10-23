/** Die RK-Herleitung zum aktuellen Stand — Editor (Formularstand) und Bogen (Draft) lesen dasselbe. */
import { abilityRecordOf, type AbilityKey } from '../schemas/abilities';
import type { Character } from '../schemas/characterSchema';
import type { ItemIndex } from '../itemLibrary';
import { mod } from '../domain/skills';
import { armorClassDerivation, type ArmorClassFeature } from './armorClass';
import { acTip } from './characterSheetTips';
import type { AbilityResolution } from './effectiveAbilities';
import { ownedGrantFeatures } from './hitPoints';
import { idleItemsIn, wornItemsIn } from './wornItems';

type AcInput = Pick<Character, 'ac' | 'inventory' | 'species' | 'classes' | 'features'>;

export function createArmorClassTip(
  input: () => AcInput | null,
  items: () => { readonly itemIndex: ItemIndex; readonly itemsLoaded: boolean },
  abilities: () => Record<AbilityKey, AbilityResolution>,
): { readonly html: string } {
  let features = $state<ArmorClassFeature[] | null>(null);
  // Nur die Links sind Abhängigkeit des Ladens; Inventar und RK rechnet `html` synchron dazu.
  const links = $derived.by(() => {
    const c = input();
    return c && {
      species: { ...c.species },
      classes: c.classes.map((k) => ({ ...k })),
      features: (c.features ?? []).map((f) => ({ ...f })),
    };
  });
  $effect(() => {
    const c = links;
    if (!c) return;
    let cancelled = false;
    void ownedGrantFeatures(c)
      .then((f) => { if (!cancelled) features = f; })
      .catch(() => { if (!cancelled) features = null; });
    return () => { cancelled = true; };
  });
  const html = $derived.by(() => {
    const c = input();
    const lib = items();
    if (!c || !features || !lib.itemsLoaded) return '';
    const resolved = abilities();
    return acTip(armorClassDerivation({
      ac: c.ac,
      worn: wornItemsIn(lib.itemIndex, c.inventory ?? []),
      idle: idleItemsIn(lib.itemIndex, c.inventory ?? []),
      features,
      mods: abilityRecordOf((k) => mod(resolved[k].score)),
    }));
  });
  return { get html() { return html; } };
}
