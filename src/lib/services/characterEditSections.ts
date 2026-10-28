/* Unter-Tabs des Charakter-Editors und welches Feld in welchem Tab bearbeitet wird. */
import type { Character } from '../schemas/characterSchema';
import { classifyChange } from '../utils/diffHighlight';

export const EDIT_SECTIONS = [
  { id: 'general', label: 'Allgemein' },
  { id: 'attacks', label: 'Angriffe' },
  { id: 'features', label: 'Merkmale' },
  { id: 'spells', label: 'Zauber & Ressourcen' },
  { id: 'inventory', label: 'Inventar' },
  { id: 'personal', label: 'Persönliches' },
] as const;

export type EditSectionId = (typeof EDIT_SECTIONS)[number]['id'];

// Total typisiert: ein neues Charakterfeld ohne Tab ist ein Compile-Fehler, kein
// Änderungspunkt, der nie erscheint. `null` = in keinem Tab sichtbar.
const SECTION_OF: Record<keyof Character, EditSectionId | null> = {
  uid: null, _version: null, _importedFrom: null, _importedAt: null,
  name: 'general', classes: 'general', classLevel: 'general', playerName: 'general',
  backgroundRef: 'general', background: 'general', species: 'general', race: 'general', xp: 'general',
  abilities: 'general', mods: 'general', ac: 'general', initiative: 'general', speed: 'general',
  hpMax: 'general', hpCurrent: 'general', hpTemp: 'general', proficiencyBonus: 'general',
  passivePerception: 'general', hitDice: 'general', hpDiceTotal: 'general',
  saveProfs: 'general', skills: 'general', alleskoenner: 'general',
  languages: 'general', tools: 'general', proficiencies: 'general',
  attacks: 'attacks', masteries: 'attacks',
  classFeatures: 'features', optionPicks: 'features', features: 'features', pinnedFeatures: 'features',
  spellcasting: 'spells', spells: 'spells', resourceAdjustments: 'spells',
  currency: 'inventory', inventory: 'inventory', inventoryNotes: 'inventory', totalWeight: 'inventory',
  traits: 'personal', ideals: 'personal', bonds: 'personal', flaws: 'personal',
  personal: 'personal', portraitFile: 'personal', figureFile: 'personal', presentation: 'personal',
  companion: 'personal',
};

// Anders als beim Einfärben zählt ein Feld, das die Datei noch nicht kennt, sobald es Inhalt hat —
// das Formular legt fehlende Felder leer an (`masteries: []`), das ist noch keine Änderung.
const isBlank = (v: unknown): boolean =>
  v == null || v === '' || v === false || (Array.isArray(v) && v.length === 0);
const differs = (before: unknown, now: unknown): boolean =>
  before === undefined ? !isBlank(now) : classifyChange(before, now) !== 'none';

export function changedSections(saved: Character | null | undefined, draft: Character): Set<EditSectionId> {
  const changed = new Set<EditSectionId>();
  if (!saved) return changed;
  for (const key of Object.keys(SECTION_OF) as (keyof Character)[]) {
    const section = SECTION_OF[key];
    if (section && !changed.has(section) && differs(saved[key], draft[key])) changed.add(section);
  }
  return changed;
}
