/**
 * Die Bogen- und Kontext-Projektion gegen die Charaktere im echten Vault, samt der
 * Übergangsbrücke: was heute im gespeicherten `spells`-Block steht, muss weiter erscheinen.
 *
 *   npm run test -- castingProjection
 */
import { describe, expect, it } from 'vitest';
import { characterSchema, type Character } from '../../src/lib/schemas/characterSchema';
import { vaultCharacter } from '../support/vaultCharacter';
import { legacyFlatView } from '../../src/lib/services/spellcasting/legacy';
import {
  contextLines,
  loadSheetSpellcasting,
  loadSpellcasting,
  openSpellChoices,
  sheetSpellcasting,
  type SheetLevel,
  type SheetSpellcasting,
} from '../../src/lib/services/spellcasting/project';


const levelOf = (view: SheetSpellcasting, level: number): SheetLevel => {
  const hit = view.levels.find((l) => l.level === level);
  if (!hit) throw new Error(`Grad ${level} fehlt (${view.levels.map((l) => l.level).join(', ')})`);
  return hit;
};

const labels = (view: SheetSpellcasting, level: number): string[] =>
  levelOf(view, level).spells.map((s) => s.label);

describe('Bogen-Projektion', () => {
  it('zeigt Klasse, Attribut und die gespeicherten Zauber eines Druiden', async () => {
    const c = vaultCharacter('Bulgur');
    const view = await loadSheetSpellcasting(c);

    expect(view.hasContent).toBe(true);
    const row = view.sources.find((s) => s.kind === 'class');
    expect(row?.label).toBe('Druide');
    expect(row?.abilityDe).toBe('Weisheit');
    expect(row?.saveDC).toBe(8 + c.proficiencyBonus + c.mods.wis);
    expect(row?.attackBonus).toBe(c.proficiencyBonus + c.mods.wis);

    expect(labels(view, 0)).toEqual(['Flammen erzeugen', 'Donnerschlag']);
    expect(levelOf(view, 1).slots).toBe(3);
    expect(labels(view, 1)).toContain('Springen');
    // Vier vorbereitete plus „Vertrauten finden" aus dem Wilden Gefährten.
    expect(labels(view, 1)).toContain('Vertrauten finden');
    expect(labels(view, 1)).toHaveLength(6);
  });

  it('rechnet Attribut und Werte, statt sie zu speichern', async () => {
    const c = vaultCharacter('Prüfling Mondkreis');
    expect(Object.keys(c.spellcasting.sources['srd-2024_druid_spellcasting'] ?? {})).toEqual(['picks']);
    const view = await loadSheetSpellcasting(c);
    expect(view.sources.find((s) => s.kind === 'class')?.abilityDe).toBe('Weisheit');
    expect(view.sources.find((s) => s.kind === 'class')?.saveDC).toBe(8 + c.proficiencyBonus + c.mods.wis);
  });

  it('führt Spezies-Zauber an ihrer Quelle und nicht doppelt', async () => {
    const view = await loadSheetSpellcasting(vaultCharacter('Prüfling Feenmagie'));
    const druidcraft = levelOf(view, 0).spells.filter((s) => s.label === 'Druidenkunst');
    expect(druidcraft).toHaveLength(1);
    expect(druidcraft[0].source).toBe('Feenmagie');
    const faerieFire = levelOf(view, 1).spells.filter((s) => s.label === 'Feenfeuer');
    expect(faerieFire).toHaveLength(1);
    expect(faerieFire[0].source).toBe('Feenmagie');
    // Die Antwort im Merkmals-Ledger bindet das Attribut der Fee.
    expect(view.sources.find((s) => s.kind === 'feature')?.abilityDe).toBe('Charisma');
  });

  it('behält Slots und Zauber eines Charakters ohne Klassen-Verlinkung', async () => {
    const c = vaultCharacter('Phönix');
    expect(c.classes).toEqual([]);
    const view = await loadSheetSpellcasting(c);

    expect(levelOf(view, 1).slots).toBe(2);
    expect(labels(view, 0)).toHaveLength(4);
    expect(labels(view, 1)).toHaveLength(6);
    expect(view.levels.every((l) => l.spells.every((s) => s.source === ''))).toBe(true);
  });

  it('lässt einen Charakter ohne Zauber leer', async () => {
    const view = await loadSheetSpellcasting(vaultCharacter('Falbala'));
    expect(view.hasContent).toBe(false);
    expect(view.levels).toEqual([]);
    expect(view.sources).toEqual([]);
  });
});

describe('KI-Kontext', () => {
  it('nennt Quelle, Werte, Slots und Zauber je Grad', async () => {
    const lines = contextLines(await loadSheetSpellcasting(vaultCharacter('Bulgur')));
    expect(lines[0]).toMatch(/^- Source: Druide — Ability: Weisheit, Save DC: \d+, Attack Bonus: [+-]\d+$/);
    expect(lines).toContain('- Slots:');
    expect(lines.some((l) => l === '  - Grad 1: 3')).toBe(true);
    expect(lines.some((l) => l.startsWith('- Zaubertricks: Flammen erzeugen'))).toBe(true);
    expect(lines.some((l) => l.startsWith('- Grad 1: '))).toBe(true);
  });

  it('meldet ein offenes Zauberattribut als offen', async () => {
    const c = vaultCharacter('Prüfling Feenmagie');
    // Ohne Ledger-Antwort UND ohne gespeicherte Bindung bleibt die Wahl der Fee offen.
    const { state, lookup, legacy } = await loadSpellcasting({
      ...c,
      features: [],
      spellcasting: { ...c.spellcasting, sources: {} },
    });
    const view = sheetSpellcasting(state, lookup, legacy);
    const fairy = view.sources.find((s) => s.kind === 'feature');
    expect(fairy?.abilityDe).toBe('');
    expect(fairy?.abilityOptionsDe).toEqual(['Intelligenz', 'Weisheit', 'Charisma']);
    expect(contextLines(view).some((l) => l.includes('Ability: offen'))).toBe(true);
  });
});

describe('Übergang zum PDF-Export', () => {
  it('liefert die flache Alt-Form aus der primären Klassen-Quelle', async () => {
    const c = vaultCharacter('Bulgur');
    const { state, lookup, legacy } = await loadSpellcasting(c);
    const flat = legacyFlatView(state, lookup, legacy);

    expect(flat.spellcastingClass).toBe('Druide');
    expect(flat.spellcastingAbility).toBe('Weisheit');
    expect(flat.saveDC).toBe(8 + c.proficiencyBonus + c.mods.wis);
    expect(flat.slots[0]).toEqual({ total: 3, used: 0 });
    expect(flat.cantrips.map((s) => s.name)).toEqual(['Flammen erzeugen', 'Donnerschlag']);
    expect(flat.byLevel['1']).toHaveLength(6);
    // Der Bibliotheks-Link bleibt am Eintrag, der Name ist nur die PDF-Zelle.
    expect(flat.cantrips[0].sourceKey).toBeTruthy();
  });

  it('nimmt bei zwei Klassen die mit der höheren Stufe', async () => {
    const c = characterSchema.parse({
      name: 'Multi',
      classes: [
        { sourceKey: 'srd-2024_wizard', name: 'Magier', level: 3 },
        { sourceKey: 'srd-2024_cleric', name: 'Kleriker', level: 5 },
      ],
      mods: { int: 3, wis: 2 },
      proficiencyBonus: 4,
    });
    const { state, lookup, legacy } = await loadSpellcasting(c);
    const flat = legacyFlatView(state, lookup, legacy);
    expect(flat.spellcastingClass).toBe('Kleriker');
    expect(flat.spellcastingAbility).toBe('Weisheit');
    expect(flat.saveDC).toBe(8 + 4 + 2);
    // Kombinierte Zauberwirkerstufe 8: 4/3/3/2.
    expect(flat.slots.map((s) => s.total).slice(0, 5)).toEqual([4, 3, 3, 2, 0]);
  });
});

describe('Offene Wahlen', () => {
  it('nennt Kontingent, Grade und Listen je Quota', async () => {
    const c = characterSchema.parse({
      name: 'Frisch',
      classes: [{ sourceKey: 'srd-2024_wizard', name: 'Magier', level: 1 }],
      intMod: 3,
    });
    const { state, lookup } = await loadSpellcasting(c);
    const open = openSpellChoices(state, lookup);

    expect(open.map((o) => o.quotaId)).toEqual(['cantrips', 'book', 'prepared']);
    expect(open.find((o) => o.quotaId === 'cantrips')).toMatchObject({
      sourceLabel: 'Magier',
      count: 3,
      levels: [0],
      lists: ['wizard'],
    });
    expect(open.find((o) => o.quotaId === 'book')).toMatchObject({ count: 6, levels: [1] });
    // `from` heißt wie in der Deklaration (`pool.from`) und nennt auch die Quelle.
    expect(open.find((o) => o.quotaId === 'prepared')?.from).toMatchObject({ quotaId: 'book' });
  });
});
