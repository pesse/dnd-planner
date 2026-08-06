/**
 * Die aufgelösten Zauberquellen zum aktuellen FORMULARSTAND. Sie hängen an Klassen, Merkmalen
 * und Attributen, also darf der Zauberblock sie nicht aus dem Draft lesen — der hinkt hinter
 * jeder Eingabe her.
 */
import type { Character, CharacterFeatureEntry, CharacterSpells } from '../schemas/characterSchema';
import { loadSpellcasting, type LoadedSpellcasting } from './spellcasting/project';
import { cloneSpellcasting } from './spellcasting/write';
import { abilityMods, type CharacterFormFields } from './characterFormFields';

export function castingInput(
  form: CharacterFormFields,
  features: CharacterFeatureEntry[],
  spells: CharacterSpells | undefined,
): Character {
  return {
    classes: form.classes.map((c) => ({ ...c })),
    species: { ...form.species },
    backgroundRef: { ...form.backgroundRef },
    features: features.map((f) => ({ ...f })),
    proficiencyBonus: form.proficiencyBonus,
    ...abilityMods(form),
    spellcasting: cloneSpellcasting(form.spellcasting),
    ...(spells ? { spells } : {}),
  } as Character;
}

export interface FormCasting {
  /** null, solange die Bibliothek lädt. */
  readonly current: LoadedSpellcasting | null;
}

export function createFormCasting(input: () => Character): FormCasting {
  let current = $state<LoadedSpellcasting | null>(null);
  $effect(() => {
    const c = input();
    let cancelled = false;
    void loadSpellcasting(c)
      .then((loaded) => { if (!cancelled) current = loaded; })
      .catch(() => { if (!cancelled) current = null; });
    return () => { cancelled = true; };
  });
  return { get current() { return current; } };
}
