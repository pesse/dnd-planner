/**
 * Fixture: Gnom-Zauberer, Hintergrund „Weiser", Stufe 1 (Charakter-Erstell-Wizard).
 * Der Fall bündelt die drei Herkünfte einer Wahl auf Stufe 1: ein Speziesmerkmal
 * („Gnomische Abstammung") mit zauber-gewährenden Zweigen, ein Herkunftstalent
 * („Eingeweihter der Magie", `grantsChoice: spellAccess`) und das Klassen-Zauberwirken.
 */
export const GNOME_SORCERER_BASICS = {
  species: { sourceKey: 'srd-2024_gnome', name: 'Gnom' },
  klass: { sourceKey: 'srd-2024_sorcerer', name: 'Zauberer' },
  background: { sourceKey: 'srd-2024_sage', name: 'Weiser' },
} as const;

/** Die Wahl-tragende Volks-Abstammung (`grantsChoice: optionList` + `grantsCasting`). */
export const LINEAGE_KEY = 'srd-2024_gnome_gnomish-lineage';
/** Flow-eigen: Liste, Attribut und Kontingent kommen aus der Deklaration. */
export const MAGIC_INITIATE_KEY = 'srd-2024_magic-initiate';

/**
 * Erwartung an das Herkunftstalent: Der Vault führt „Magic Initiate" generisch („Cleric,
 * Druid, or Wizard") als `grantsChoice.spellLists`, der Hintergrund „Weiser" legt es in
 * seinen `benefits` auf die Magierliste fest. `spellAccessOffer` verengt die Deklaration
 * damit auf EINEN Wert — geprüft in `tests/integration/spellAccess.test.ts`.
 */
export const MAGIC_INITIATE_LIST = 'wizard';

export const MAGIC_INITIATE_CANTRIPS = 2;
export const MAGIC_INITIATE_LEVEL1 = 1;
