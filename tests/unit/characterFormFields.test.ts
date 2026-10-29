/**
 * `withCurrentSorted`: deutsche Kollation statt Quell-Reihenfolge, ohne die
 * Altdaten-voranstellen-Invariante von `withCurrent` zu verlieren.
 * Dazu Gefährte, eigene Figur und Angriffs-Notiz: im Formular immer ein Feld, in der Datei nur bei Inhalt.
 */
import { describe, expect, it } from 'vitest';
import {
  formDraftPatch, initialFormCarry, initialFormFields, withCurrentSorted,
} from '../../src/lib/services/characterFormFields';
import { characterSchema } from '../../src/lib/schemas/characterSchema';
import { CLASS_NAMES_DE } from '../../src/lib/services/classProgression';

describe('withCurrentSorted', () => {
  it('sortiert deutsch kollationiert statt nach Quell-Reihenfolge', () => {
    const sorted = withCurrentSorted(CLASS_NAMES_DE, '');
    expect(sorted).toEqual([
      'Barbar', 'Barde', 'Druide', 'Hexenmeister', 'Kämpfer', 'Kleriker',
      'Magier', 'Mönch', 'Paladin', 'Schurke', 'Waldläufer', 'Zauberer',
    ]);
    // Kämpfer/Mönch stehen NICHT hinter Zauberer — genau der Fehler, den 'de' verhindert.
    expect(CLASS_NAMES_DE).toEqual([
      'Barbar', 'Barde', 'Kleriker', 'Druide', 'Kämpfer', 'Mönch', 'Paladin',
      'Waldläufer', 'Schurke', 'Zauberer', 'Hexenmeister', 'Magier',
    ]);
  });

  it('stellt einen Altdaten-Wert außerhalb der Liste voran', () => {
    const sorted = withCurrentSorted(CLASS_NAMES_DE, 'Hexer');
    expect(sorted[0]).toBe('Hexer');
  });
});

const patchOf = (raw: unknown) => {
  const character = characterSchema.parse(raw);
  return formDraftPatch(initialFormFields(character), initialFormCarry(character), []);
};

describe('Gefährte im Formular', () => {

  it('schreibt kein leeres Objekt in eine Datei ohne Gefährten', () => {
    expect(patchOf({ name: 'Testfigur' }).companion).toBeUndefined();
  });

  it('trägt Text und Bilddatei unverändert zurück', () => {
    const companion = { text: 'Waldi, Wolf', imageFile: 'companion.png' };
    expect(patchOf({ name: 'Testfigur', companion }).companion).toEqual(companion);
  });

  it('hält den Text auch ohne Bild', () => {
    expect(patchOf({ name: 'Testfigur', companion: { text: 'Waldi' } }).companion)
      .toEqual({ text: 'Waldi' });
  });
});

describe('Eigene Figur im Formular', () => {
  it('trägt die Bilddatei zurück und schreibt ohne sie kein Feld', () => {
    expect(patchOf({ name: 'Testfigur', figureFile: 'figure.jpg' }).figureFile).toBe('figure.jpg');
    expect(patchOf({ name: 'Testfigur' }).figureFile).toBeUndefined();
  });
});

describe('Angriffs-Notiz', () => {
  const attacksOf = (notes: (string | undefined)[]) => patchOf({
    name: 'Testfigur',
    attacks: notes.map((note, i) => ({ name: `Waffe ${i}`, note })),
  }).attacks;

  it('schreibt eine leere Notiz nicht in die Datei', () => {
    expect(attacksOf(['   ', undefined])).toEqual([
      expect.not.objectContaining({ note: expect.anything() }),
      expect.not.objectContaining({ note: expect.anything() }),
    ]);
  });

  it('trägt eine gefüllte Notiz getrimmt zurück', () => {
    expect(attacksOf([' +1W6 jede lange Rast '])[0].note).toBe('+1W6 jede lange Rast');
  });
});

describe('Karten-Häkchen am Inventar', () => {
  const inventoryOf = (printCard: boolean | undefined) => patchOf({
    name: 'Testfigur',
    inventory: [{ name: 'Langschwert', sourceKey: 'srd-2024_longsword', count: '1', weight: '3', printCard }],
  }).inventory;

  it('schreibt das gesetzte Häkchen in die Datei zurück', () => {
    expect(inventoryOf(true)[0].printCard).toBe(true);
  });

  it('lässt ein ungesetztes Häkchen weg statt false zu schreiben', () => {
    expect(inventoryOf(false)[0]).not.toHaveProperty('printCard');
    expect(inventoryOf(undefined)[0]).not.toHaveProperty('printCard');
  });
});

describe('Resistenz-Wahl am Inventar', () => {
  const inventoryOf = (resistance: string | undefined) => patchOf({
    name: 'Testfigur',
    inventory: [{ name: 'Rüstung der Resistenz (Fellrüstung)', sourceKey: 'srd-2024_armor-of-resistance-hide-armor', count: '1', weight: '6', resistance }],
  }).inventory;

  it('schreibt die gewählte Resistenz in die Datei zurück', () => {
    expect(inventoryOf('fire')[0].resistance).toBe('fire');
  });

  it('schreibt ohne Wahl kein Feld', () => {
    expect(inventoryOf(undefined)[0]).not.toHaveProperty('resistance');
  });
});
