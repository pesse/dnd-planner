/** KON (samt wirkender Gegenstände), Stufe und Boni je Stufe zum aktuellen FORMULARSTAND — die Grundlage von `hitPointsFix`. */
import type { CharacterFeatureEntry } from '../schemas/characterSchema';
import { mod } from '../domain/skills';
import type { CharacterFormFields } from './characterFormFields';
import { effectiveScore, loadWornAbilityEffects, type WornAbilityEffect } from './effectiveAbilities';
import { characterLevel } from './declaration/carriers';
import { maxDiceTotal, ownedHpPerLevel, type HpBasis } from './hitPoints';

export interface FormHpBasis {
  /** null, solange die Bibliothek lädt — oder wenn sie nicht geladen werden konnte. */
  readonly current: HpBasis | null;
}

export function createFormHpBasis(form: () => CharacterFormFields, features: () => CharacterFeatureEntry[]): FormHpBasis {
  let resolved = $state<{ perLevel: number; maxDice?: number; effects: WornAbilityEffect[] } | null>(null);
  // Nur Links und Inventar sind Abhängigkeit; KON und Stufe rechnet `current` synchron dazu.
  const input = $derived.by(() => ({
    species: { ...form().species },
    classes: form().classes.map((c) => ({ ...c })),
    features: features().map((f) => ({ ...f })),
    inventory: form().inventory.map((i) => ({ ...i })),
  }));
  $effect(() => {
    const c = input;
    let cancelled = false;
    void Promise.all([ownedHpPerLevel(c), maxDiceTotal(c.classes), loadWornAbilityEffects(c.inventory)])
      .then(([perLevel, maxDice, effects]) => { if (!cancelled) resolved = { perLevel, maxDice, effects }; })
      .catch(() => { if (!cancelled) resolved = null; });
    return () => { cancelled = true; };
  });
  return {
    get current() {
      if (!resolved) return null;
      const { effects, ...rest } = resolved;
      return { conMod: mod(effectiveScore(form().abilities.con, effects, 'con')), level: characterLevel(form().classes), ...rest };
    },
  };
}
