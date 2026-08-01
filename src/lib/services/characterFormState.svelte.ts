/**
 * Formularzustand des Charakter-Editors: aus dem Draft gefüllt und über EINEN Effekt dorthin
 * zurückgespiegelt — nur so greifen Dirty-Tracking und Save-Bar ohne eigenen Knopf.
 */
import {
  formDraftPatch, initialFormCarry, initialFormFields, type CharacterFormFields,
} from './characterFormFields';
import type { Character } from '../schemas/characterSchema';

export interface CharacterFormState {
  fields: CharacterFormFields;
  legacyClassLevel: string;
}

/**
 * `draft` ist ein Getter, kein Wert: der Stufenaufstieg tauscht die Draft-REFERENZ aus,
 * um das Formular zu remounten — der Effekt muss dann auf das neue Objekt schreiben,
 * nicht auf das beim Anlegen erfasste.
 */
export function createCharacterFormState(draft: () => Character): CharacterFormState {
  const initial = draft();
  const fields = $state(initialFormFields(initial));
  const carry = initialFormCarry(initial);

  // Liest den Draft nur über `draft()` — kein reaktiver Read einzelner `character.*`,
  // sonst schlösse sich eine Schreib-/Lese-Schleife.
  $effect(() => {
    Object.assign(draft(), formDraftPatch(fields, carry));
  });

  return { fields, legacyClassLevel: carry.legacyClassLevel };
}
