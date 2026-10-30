/**
 * Die Kennzeichen der Zauberzeilen über den echten Vault: Tiergestalt beim Mondzirkel und beim
 * Erzdruiden, Kampfrausch, immer vorbereitete Zauber und wegfallende Komponenten.
 *
 *   npm run test -- spellMarksSheet
 */
import { describe, expect, it } from 'vitest';
import { characterSchema, type Character } from '../../src/lib/schemas/characterSchema';
import { loadCharacterPrintData } from '../../src/lib/print/character/data';
import { buildCharacterSheetHtml } from '../../src/lib/print/character/document';
import { defaultSelection, sheetSections } from '../../src/lib/print/character/sections';
import { testCharacter } from '../support/testCharacter';

const sheetOf = async (character: Character) => {
  const data = await loadCharacterPrintData({ character });
  return buildCharacterSheetHtml(data, defaultSelection(sheetSections(data)));
};

const lineOf = (html: string, label: string): string => {
  const line = html.split('<div class="spell">').slice(1).map((s) => s.split('</div>')[0])
    .find((s) => s.includes(`class="sname">${label}<`));
  if (!line) throw new Error(`Zeile „${label}" fehlt`);
  return line;
};

const mark = (letter: string) => `>${letter}</span>`;

const moonDruid = (level: number, extraPrepared: string[] = []): Character => {
  const c = testCharacter('Prüfling Mondkreis');
  const source = c.spellcasting!.sources['srd-2024_druid_spellcasting'];
  return {
    ...c,
    classes: c.classes.map((cls) => ({ ...cls, level })),
    spellcasting: {
      ...c.spellcasting!,
      sources: {
        ...c.spellcasting!.sources,
        'srd-2024_druid_spellcasting': {
          ...source,
          picks: { ...source.picks, prepared: [...(source.picks.prepared ?? []), ...extraPrepared] },
        },
      },
    },
  };
};

describe('Zauber-Kennzeichen auf dem Bogen', () => {
  it('markiert beim Mondzirkel die Zirkelzauber als in Tiergestalt wirkbar', async () => {
    const html = await sheetOf(moonDruid(3));

    expect(lineOf(html, 'Mondstrahl')).toContain(mark('T'));
    expect(lineOf(html, 'Verstricken')).not.toContain(mark('T'));
    expect(html).toContain('Tiergestalt: nur mit <b>T</b> markierte Zauber, Konzentration bleibt');
  });

  it('kennzeichnet Konzentration und füllt den Kasten immer vorbereiteter Zauber', async () => {
    const html = await sheetOf(moonDruid(3));

    expect(lineOf(html, 'Mondstrahl')).toContain(mark('K'));
    expect(lineOf(html, 'Mondstrahl')).toContain('cbox always');
    expect(lineOf(html, 'Verstricken')).not.toContain('cbox always');
    expect(html).toContain('immer vorbereitet, zählt nicht gegen die Vorbereitung');
  });

  it('dreht beim Erzdruiden die Markierung um: gekennzeichnet sind die Ausnahmen', async () => {
    const html = await sheetOf(moonDruid(18, ['srd-2024_reincarnate']));

    expect(lineOf(html, 'Wiedergeburt')).toContain('<s>T</s>');
    expect(lineOf(html, 'Verstricken')).not.toContain('>T<');
    expect(html).toContain('Tiergestalt: alle Zauber außer mit <s><b>T</b></s> markierten');
  });

  it('nennt den Kampfrausch, sobald eine Barbaren-Stufe dazukommt', async () => {
    const html = await sheetOf(characterSchema.parse({
      name: 'Rhea Dornwild',
      classes: [
        { sourceKey: 'srd-2024_druid', name: 'Druide', level: 2 },
        { sourceKey: 'srd-2024_barbarian', name: 'Barbar', level: 1 },
      ],
    }));

    expect(html).toContain('Kampfrausch: kein Zaubern, Konzentration endet');
    expect(html).toContain('Tiergestalt: kein Zaubern, Konzentration bleibt');
  });

  it('lässt beim Großen Alten die Verbalkomponente nur bei Verzauberung und Illusion weg', async () => {
    const html = await sheetOf(characterSchema.parse({
      name: 'Ilse Tiefenruf',
      classes: [{
        sourceKey: 'srd-2024_warlock', name: 'Hexenmeister', level: 3,
        subclassKey: 'phb-2024_great-old-one-patron', subclassName: 'Großer Alter',
      }],
    }));

    expect(lineOf(html, 'Dissonantes Flüstern')).toContain('ohne V');
    expect(lineOf(html, 'Gedanken wahrnehmen')).not.toContain('ohne');
  });
});
