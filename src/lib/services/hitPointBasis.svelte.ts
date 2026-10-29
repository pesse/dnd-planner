/** KON, Stufe und Boni je Stufe zum aktuellen Stand — für `hitPointsFix` und die TP-Herleitung, in Editor und Bogen. */
import { mod } from '../domain/skills';
import type { AbilityResolution } from './effectiveAbilities';
import { hpBasisOf, loadHpLibraryParts, type HpBasis, type HpLibraryParts, type OwnedLinks } from './hitPoints';
import type { PerLevelSource } from './perLevelEffects';

export interface CharacterHpBasis {
  /** null, solange die Bibliothek lädt — oder wenn sie nicht geladen werden konnte. */
  readonly current: HpBasis | null;
  readonly sources: PerLevelSource[];
}

export function createHpBasis(
  links: () => OwnedLinks,
  con: () => AbilityResolution,
): CharacterHpBasis {
  let resolved = $state<HpLibraryParts | null>(null);
  // Nur die Links sind Abhängigkeit; KON und Stufe rechnet `current` synchron dazu.
  const input = $derived.by(() => {
    const c = links();
    return {
      species: { ...c.species },
      classes: c.classes.map((k) => ({ ...k })),
      features: (c.features ?? []).map((f) => ({ ...f })),
      backgroundRef: { ...c.backgroundRef },
    };
  });
  $effect(() => {
    const c = input;
    let cancelled = false;
    void loadHpLibraryParts(c)
      .then((parts) => { if (!cancelled) resolved = parts; })
      .catch(() => { if (!cancelled) resolved = null; });
    return () => { cancelled = true; };
  });
  return {
    get current() {
      return resolved && hpBasisOf(input.classes, mod(con().score), resolved);
    },
    get sources() { return resolved?.sources ?? []; },
  };
}
