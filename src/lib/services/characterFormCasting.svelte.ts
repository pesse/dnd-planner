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
    abilities: { ...form.abilities },
    mods: abilityMods(form),
    spellcasting: cloneSpellcasting(form.spellcasting),
    ...(spells ? { spells } : {}),
  } as Character;
}

export interface FormCasting {
  /** null, solange die Bibliothek lädt — oder wenn sie nicht geladen werden konnte. */
  readonly current: LoadedSpellcasting | null;
  /** Der Grund des Fehlschlags; ohne ihn bleibt der Ladehinweis für immer stehen. */
  readonly error: string;
}

export function createFormCasting(input: () => Character): FormCasting {
  let current = $state<LoadedSpellcasting | null>(null);
  let error = $state('');
  $effect(() => {
    const c = input();
    let cancelled = false;
    void loadSpellcasting(c)
      .then((loaded) => { if (!cancelled) { current = loaded; error = ''; } })
      .catch((e) => { if (!cancelled) { current = null; error = `${e}`; } });
    return () => { cancelled = true; };
  });
  return {
    get current() { return current; },
    get error() { return error; },
  };
}
