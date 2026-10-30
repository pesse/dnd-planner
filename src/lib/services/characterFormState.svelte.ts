/**
 * Formularzustand des Charakter-Editors: aus dem Draft gefüllt und über EINEN Effekt dorthin
 * zurückgespiegelt — nur so greifen Dirty-Tracking und Save-Bar ohne eigenen Knopf.
 */
import {
  formDraftPatch, initialFormCarry, initialFormFields, type CharacterFormFields,
} from './characterFormFields';
import type { Character } from '../schemas/characterSchema';
import type { WornAbilityEffect } from './effectiveAbilities';
import type { DeclaredAttackEffects } from './attackEffects';
import type { CheckSource } from './abilityChecks';
import type { SpellAttackContext } from './spellAttackCalc';

export interface CharacterFormState {
  fields: CharacterFormFields;
  legacyClassLevel: string;
}

export interface FormRuntimeInputs {
  worn: readonly WornAbilityEffect[];
  declared: DeclaredAttackEffects;
  checks: readonly CheckSource[];
  spellOf?: SpellAttackContext['spellOf'];
}

/**
 * `draft` ist ein Getter, kein Wert: der Stufenaufstieg tauscht die Draft-REFERENZ aus,
 * um das Formular zu remounten — der Effekt muss dann auf das neue Objekt schreiben,
 * nicht auf das beim Anlegen erfasste.
 *
 * `inputs` ist `null`, solange Item-Bibliothek und Merkmale laden: bis dahin schreibt der Effekt
 * nicht, sonst stünden kurz Mods und Angriffe ohne Gegenstände im Draft und der Charakter wirkte geändert.
 */
export function createCharacterFormState(
  draft: () => Character,
  inputs: () => FormRuntimeInputs | null,
): CharacterFormState {
  const initial = draft();
  const fields = $state(initialFormFields(initial));
  const carry = initialFormCarry(initial);

  // Liest den Draft nur über `draft()` — kein reaktiver Read einzelner `character.*`,
  // sonst schlösse sich eine Schreib-/Lese-Schleife.
  $effect(() => {
    const now = inputs();
    if (now) Object.assign(draft(), formDraftPatch(fields, carry, now.worn, now.declared, now.checks, now.spellOf));
  });

  return { fields, legacyClassLevel: carry.legacyClassLevel };
}
