/**
 * Der Sektions-Katalog: was angeboten wird, entscheidet allein das fertige Bündel.
 * Von Hand gebaut, ohne Vault und ohne Promises — genau das macht die Vorschau schnell.
 */
import { describe, expect, it } from 'vitest';
import { characterSchema } from '../../src/lib/schemas/characterSchema';
import { defaultSelection, sheetSections, STATIC_SECTION_IDS } from '../../src/lib/print/character/sections';
import type { CharacterPrintData } from '../../src/lib/print/character/data';

const emptyData = (over: Partial<CharacterPrintData> = {}): CharacterPrintData => ({
  character: characterSchema.parse({ name: 'Testfigur' }),
  portraitUrl: '',
  freetext: '',
  attacks: [],
  features: { speciesGroups: [], classGroups: [], backgroundGroups: [], featEntries: [], orphanChoices: [] },
  grouped: { sources: [], slots: [], pact: null, manualSlots: false, extra: [], issues: [] },
  mastery: { allowance: 0, className: '', meleeOnly: false, weapons: [] },
  pools: [],
  resources: [],
  spellCards: '',
  ...over,
});

const source = (id: string, label: string) => ({
  id, label, featureDe: '', abilityDe: 'Charisma',
  abilityOptions: [], saveDC: 13, attackBonus: 5, quotas: [],
});

const ids = (d: CharacterPrintData) => sheetSections(d).map((s) => s.id);

const render = (d: CharacterPrintData, id: string): string =>
  sheetSections(d).find((s) => s.id === id)?.render(d) ?? '';

describe('Sektionen des Charakterbogens', () => {
  it('bietet einer leeren Figur nur Übersicht und Ausrüstung an', () => {
    // Der Druck ist Ausgabe: ein Block ohne Inhalt wäre ein Formular. Die Ausrüstung ist die
    // Ausnahme — Leerzeilen und Münzkapseln sind dort der Zweck.
    expect(ids(emptyData())).toEqual(['overview', 'inventory']);
  });

  it('blendet Waffenmeisterschaft, Optionen und Ressourcen erst ein, wenn es sie gibt', () => {
    const d = emptyData({
      mastery: { allowance: 2, className: 'Kämpfer', meleeOnly: false, weapons: [] },
      pools: [{ featureKey: 'srd-2024_sorcerer_metamagic', titleDe: 'Metamagie', className: 'Zauberer', allowance: 2, options: [] }],
      resources: [{ className: 'Zauberer', tracks: [{ column: 'Rages', label: 'Kampfrausch', kind: 'count', max: 3, text: '3', spell: false }] }],
    });

    expect(ids(d)).toContain('masteries');
    expect(ids(d)).toContain('resources');
    expect(ids(emptyData())).not.toContain('masteries');
    // Die Options-Pools gehören zum Kopf des Zauberblatts, nicht zu einer eigenen Sektion.
    expect(render(d, 'spellTop')).toContain('Metamagie');
  });

  it('nimmt Volks- und Klassenmerkmale aus dem Freitext, nicht aus der Bibliothek', () => {
    const groups = [{ title: 'Waldelf', sourceKey: 'srd-2024_elf', unresolved: false, features: [] }];
    const withText = characterSchema.parse({ name: 'Testfigur', classFeatures: 'Wildgestalt: 2× pro Rast' });

    expect(ids(emptyData({ features: { ...emptyData().features, speciesGroups: groups } })))
      .not.toContain('featuresSpecies');
    // Die Klassenmerkmale stehen als Kasten der Detailseite, neben den Volksmerkmalen.
    const d = emptyData({ character: withText });
    expect(ids(d)).toContain('featuresClass');
    expect(render(d, 'featuresClass')).toContain('Wildgestalt: 2× pro Rast');
    expect(render(d, 'overview')).not.toContain('Wildgestalt: 2× pro Rast');
  });

  it('führt einen Zauber ohne Quelle nur, solange kein Kontingent ihn schon führt', () => {
    const bolt = { key: 'fire-bolt', label: 'Feuerpfeil', level: 0 };
    const quota = {
      sourceId: 'cls:wizard', quotaId: 'q', label: 'Vorbereitet', cast: [], castNote: '', swapNote: '',
      levels: [], lists: [], schools: [], from: null, into: null,
      count: 0, fixed: false, spells: [bolt], open: 0,
    };
    const loose = emptyData({ grouped: { ...emptyData().grouped, extra: [bolt] } });
    const placed = emptyData({
      grouped: {
        ...emptyData().grouped, extra: [bolt],
        sources: [{ ...source('cls:wizard', 'Magier'), quotas: [quota] }],
      },
    });

    expect(ids(loose)).toContain('spellsExtra');
    expect(ids(placed)).not.toContain('spellsExtra');
  });

  it('bietet die Volltext-Karten an, sobald es Zauber gibt, und hakt sie nicht vor', () => {
    const d = emptyData({ grouped: { ...emptyData().grouped, extra: [{ key: 'fire-bolt', label: 'Feuerpfeil', level: 0 }] } });

    expect(ids(emptyData())).not.toContain('spellCards');
    expect(ids(d)).toContain('spellCards');
    expect(defaultSelection(sheetSections(d)).spellCards).toBe(false);
  });

  it('legt Quellen mit denselben Zauberwerten in eine Sektion, die Herkunft ins Label', () => {
    const d = emptyData({
      grouped: {
        sources: [source('cls:druid', 'Druide'), source('sub:moon', 'Zirkel des Mondes')],
        slots: [{ level: 1, total: 4, used: 0 }], pact: null, manualSlots: false, extra: [], issues: [],
      },
    });

    expect(ids(d).filter((id) => id.startsWith('spells:'))).toEqual(['spells:cls:druid']);
    expect(sheetSections(d).find((s) => s.id === 'spells:cls:druid')?.label).toContain('Zirkel des Mondes');
  });

  it('trennt Quellen, die eigene Zauberwerte mitbringen', () => {
    const feat = { ...source('feat:magic-initiate', 'Eingeweihter der Magie'), abilityDe: 'Weisheit', saveDC: 11 };
    const d = emptyData({
      grouped: {
        sources: [source('cls:wizard', 'Magier'), feat],
        slots: [{ level: 1, total: 4, used: 0 }], pact: null, manualSlots: false, extra: [], issues: [],
      },
    });

    expect(ids(d)).toContain('spells:cls:wizard');
    expect(ids(d)).toContain('spells:feat:magic-initiate');
  });

  it('stellt den Vorrat vor die Zauberquellen', () => {
    const d = emptyData({
      grouped: {
        sources: [source('cls:wizard', 'Magier')],
        slots: [{ level: 1, total: 4, used: 0 }], pact: null, manualSlots: false, extra: [], issues: [],
      },
    });
    const order = ids(d);

    expect(order.indexOf('spellTop')).toBeLessThan(order.indexOf('spells:cls:wizard'));
  });

  it('hakt genau die verfügbaren Sektionen vor, Notizen ausgenommen', () => {
    const d = emptyData({ freetext: 'Tagebuch' });
    const selection = defaultSelection(sheetSections(d));

    expect(selection.freetext).toBe(false);
    expect(selection.overview).toBe(true);
    expect(Object.keys(selection)).toEqual(ids(d));
  });

  it('gibt jeder Sektion eines der vier Blätter', () => {
    const pages = new Set(sheetSections(emptyData()).map((s) => s.page));

    expect([...pages].every((p) => ['overview', 'details', 'spells', 'spellCards'].includes(p))).toBe(true);
  });

  it('führt keine Id doppelt', () => {
    expect(new Set(STATIC_SECTION_IDS).size).toBe(STATIC_SECTION_IDS.length);
  });
});
