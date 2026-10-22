/** KON, Stufe und Boni je Stufe zum aktuellen FORMULARSTAND — die Grundlage von `hitPointsFix`. */
import type { CharacterFeatureEntry } from '../schemas/characterSchema';
import { abilityMods, type CharacterFormFields } from './characterFormFields';
import { characterLevel } from './declaration/carriers';
import { maxDiceTotal, ownedHpPerLevel, type HpBasis } from './hitPoints';

export interface FormHpBasis {
  /** null, solange die Bibliothek lädt — oder wenn sie nicht geladen werden konnte. */
  readonly current: HpBasis | null;
}

export function createFormHpBasis(form: () => CharacterFormFields, features: () => CharacterFeatureEntry[]): FormHpBasis {
  let resolved = $state<{ perLevel: number; maxDice?: number } | null>(null);
  // Nur die Links sind Abhängigkeit; KON und Stufe rechnet `current` synchron dazu.
  const input = $derived.by(() => ({
    species: { ...form().species },
    classes: form().classes.map((c) => ({ ...c })),
    features: features().map((f) => ({ ...f })),
  }));
  $effect(() => {
    const c = input;
    let cancelled = false;
    void Promise.all([ownedHpPerLevel(c), maxDiceTotal(c.classes)])
      .then(([perLevel, maxDice]) => { if (!cancelled) resolved = { perLevel, maxDice }; })
      .catch(() => { if (!cancelled) resolved = null; });
    return () => { cancelled = true; };
  });
  return {
    get current() {
      if (!resolved) return null;
      return { conMod: abilityMods(form()).con, level: characterLevel(form().classes), ...resolved };
    },
  };
}
