/** KON, Stufe und Boni je Stufe zum aktuellen Stand — für `hitPointsFix` und die TP-Herleitung, in Editor und Bogen. */
import type { Character } from '../schemas/characterSchema';
import { mod } from '../domain/skills';
import { characterLevel } from './declaration/carriers';
import type { AbilityResolution } from './effectiveAbilities';
import { maxDiceTotal, ownedHpPerLevelSources, type HpBasis } from './hitPoints';
import { hpPerLevelSum, type PerLevelSource } from './perLevelEffects';

export interface CharacterHpBasis {
  /** null, solange die Bibliothek lädt — oder wenn sie nicht geladen werden konnte. */
  readonly current: HpBasis | null;
  readonly sources: PerLevelSource[];
}

export function createHpBasis(
  links: () => Pick<Character, 'species' | 'classes' | 'features'>,
  con: () => AbilityResolution,
): CharacterHpBasis {
  let resolved = $state<{ sources: PerLevelSource[]; maxDice?: number } | null>(null);
  // Nur die Links sind Abhängigkeit; KON und Stufe rechnet `current` synchron dazu.
  const input = $derived.by(() => {
    const c = links();
    return {
      species: { ...c.species },
      classes: c.classes.map((k) => ({ ...k })),
      features: (c.features ?? []).map((f) => ({ ...f })),
    };
  });
  $effect(() => {
    const c = input;
    let cancelled = false;
    void Promise.all([ownedHpPerLevelSources(c), maxDiceTotal(c.classes)])
      .then(([sources, maxDice]) => { if (!cancelled) resolved = { sources, maxDice }; })
      .catch(() => { if (!cancelled) resolved = null; });
    return () => { cancelled = true; };
  });
  return {
    get current() {
      if (!resolved) return null;
      return {
        conMod: mod(con().score),
        level: characterLevel(input.classes),
        perLevel: hpPerLevelSum(resolved.sources),
        maxDice: resolved.maxDice,
      };
    },
    get sources() { return resolved?.sources ?? []; },
  };
}
