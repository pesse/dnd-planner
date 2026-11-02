/**
 *   npm run test -- ddbJsonParse
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ddbCharacterJsonSchema } from '../../src/lib/schemas/ddbCharacterJson';
import { parseDdbJson } from '../../src/lib/services/ddbImport/parseJson';
import { ddbCharacterId, fetchDdbCharacter } from '../../src/lib/services/ddbImport/fetchCharacter';
import { BOOK_SOURCE_ID, ddbGnomeWizardJson } from '../fixtures/ddbCharacterJson';
import { importSourceFromTitle, isImportSource, staticSourceLabel, toSourceKey } from '../../src/lib/schemas/source';
import { bookLabel, buildSourceCatalog, isCreatableSource, suggestedSource, withDeclarations } from '../../src/lib/services/ddbImport/sources';

const sheetOf = (raw = ddbGnomeWizardJson()) => parseDdbJson(ddbCharacterJsonSchema.parse(raw));

describe('D&D-Beyond-JSON lesen', () => {
  const sheet = sheetOf();

  it('rechnet Attribute aus Grundwert und Hintergrund-Bonus', () => {
    expect(sheet.abilities).toEqual({ str: 8, dex: 14, con: 14, int: 17, wis: 12, cha: 10 });
    expect(sheet.saveProfs).toMatchObject({ int: true, wis: true, str: false });
  });

  it('leitet Fertigkeiten mit Übung und Expertise her', () => {
    const by = Object.fromEntries(sheet.skills.map((s) => [s.name, s]));
    expect(by['Investigation']).toEqual({ name: 'Investigation', value: 7, mark: 'E' });
    expect(by['Arcana']).toEqual({ name: 'Arcana', value: 5, mark: 'P' });
    expect(by['Athletics']).toEqual({ name: 'Athletics', value: -1, mark: '' });
    expect(sheet.passivePerception).toBe('11');
  });

  it('rechnet RK, TP, Trefferwürfel, Bewegung und Initiative', () => {
    expect(sheet).toMatchObject({ ac: '12', hpMax: '14', hitDice: '2d6', speedFt: 30, initiative: '+2', proficiencyBonus: 2 });
  });

  it('zählt einen Gegenstandsbonus erst eingestimmt', () => {
    const raw = ddbGnomeWizardJson();
    raw.inventory.find((i: { definition: { name: string } }) => i.definition.name === 'Cloak of Protection').isAttuned = true;
    expect(sheetOf(raw).ac).toBe('13');
  });

  it('trennt Übungslisten und Sprachen', () => {
    expect(sheet.weapons).toEqual(['Simple Weapons']);
    expect(sheet.tools).toEqual(["Calligrapher's Supplies"]);
    expect(sheet.languages).toEqual(['Common', 'Draconic']);
  });

  it('hängt Wahlen an ihr Merkmal und lässt künftige Klassenmerkmale weg', () => {
    expect(sheet.features.find((f) => f.name === 'Gnomish Lineage')).toEqual({ section: 'GNOME SPECIES TRAITS', name: 'Gnomish Lineage', options: ['Forest Gnome'], origin: null });
    expect(sheet.features.some((f) => f.name === 'Wizard Subclass')).toBe(false);
    expect(sheet.features.filter((f) => f.section === 'FEATS').map((f) => f.name)).toContain('Magic Initiate (Wizard)');
  });

  it('nennt die Quelle jedes Zaubers', () => {
    expect(sheet.spells).toContainEqual(expect.objectContaining({ name: 'Mage Hand', level: 0, source: 'Magic Initiate (Wizard)' }));
    expect(sheet.spells).toContainEqual(expect.objectContaining({ name: 'Speak with Animals', source: 'Gnome' }));
    expect(sheet.spells).toContainEqual(expect.objectContaining({ name: 'Shield', source: 'Wizard' }));
    expect(sheet.spellcastingClasses).toEqual(['Wizard']);
  });

  it('übernimmt Ausrüstungsstatus und ungekürzte Texte', () => {
    expect(sheet.inventory[0]).toMatchObject({ name: 'Dagger', qty: 1, totalWeightLb: 1, equipped: true });
    expect(sheet.inventory.find((i) => i.name === 'Glitzerstaub')).toMatchObject({
      qty: 1, totalWeightLb: null, equipped: false, detail: null, origin: { homebrew: true, desc: 'Funkelt im Dunkeln.' },
    });
    expect(sheet.ideals).toMatch(/Büchern$/);
    expect(sheet.notes).toContain('### Feinde\n\nDer Bücherwurm');
    expect(sheet.personal).toMatchObject({ size: 'Small', alignment: 'Neutral Good', weight: '44 lb', age: '120' });
  });

  it('führt Buchquelle und Beschreibung als Klartext mit', () => {
    const feat = sheet.features.find((f) => f.name === 'Inkbound Pact');
    expect(feat?.origin).toEqual({ sourceId: BOOK_SOURCE_ID, homebrew: false, desc: 'You can sign a pact in ink.\n\n- Once per long rest.' });
    const quill = sheet.inventory.find((i) => i.name === 'Quill of Endless Ink');
    expect(quill?.detail).toMatchObject({ filterType: 'Wondrous item', rarity: 'Uncommon', magic: true, attunement: '' });
  });
});

describe('Herkunft importierter Buchinhalte', () => {
  it('schlägt den Kurznamen aus dem Buchtitel vor und erkennt die Familie', () => {
    expect(importSourceFromTitle('The Crooked Moon Part One: Player Options & Campaign Setting')).toBe('crooked-moon-import');
    expect(importSourceFromTitle('Northlands Worldbook')).toBe('northlands-worldbook-import');
    expect(isImportSource('crooked-moon-import')).toBe(true);
    expect(isImportSource('homebrew-sam')).toBe(false);
    expect(staticSourceLabel('crooked-moon-import')).toBe('Crooked Moon (Import)');
    expect(toSourceKey('crooked-moon-import')).toBe('crooked-moon-import');
  });

  it('nimmt das Buch aus dem D&D-Beyond-Katalog', () => {
    const catalog = buildSourceCatalog({ sources: [
      { id: 2, name: 'PHB', description: 'Player&rsquo;s Handbook (2014)', sourceCategoryId: 26 },
      { id: BOOK_SOURCE_ID, name: 'TINK', description: 'The Inkwell Codex: Player Options', sourceCategoryId: 34 },
    ] });
    expect(catalog.get(2)).toMatchObject({ title: 'Player’s Handbook (2014)', legacy: true });
    expect(bookLabel(catalog, BOOK_SOURCE_ID)).toBe('The Inkwell Codex: Player Options');
    expect(suggestedSource(catalog, BOOK_SOURCE_ID)).toBe('inkwell-codex-import');
    expect(bookLabel(catalog, 42)).toBe('D&D-Beyond-Quelle 42');
  });

  it('legt das Buch eines installierten Packs unter dessen Herkunft an, auch ohne Katalog', () => {
    const declared = { source: 'inkwell-codex', label: 'Inkwell', title: 'The Inkwell Codex', ddbSourceIds: [BOOK_SOURCE_ID] };
    const catalog = withDeclarations(new Map(), [declared]);
    expect(bookLabel(catalog, BOOK_SOURCE_ID)).toBe('The Inkwell Codex');
    expect(suggestedSource(catalog, BOOK_SOURCE_ID)).toBe('inkwell-codex');
    expect(isCreatableSource(catalog, 'inkwell-codex')).toBe(true);
    expect(isCreatableSource(catalog, 'phb-2024')).toBe(false);
    expect(isCreatableSource(catalog, 'homebrew-sam')).toBe(true);
  });
});

describe('D&D-Beyond-Link', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('findet die ID in allen Link-Formen', () => {
    expect(ddbCharacterId('https://www.dndbeyond.com/characters/12345678/AbCdEf')).toBe('12345678');
    expect(ddbCharacterId('ddb.ac/characters/12345678')).toBe('12345678');
    expect(ddbCharacterId(' 12345678 ')).toBe('12345678');
    expect(ddbCharacterId('https://www.dndbeyond.com/campaigns/42')).toBeNull();
  });

  it('meldet einen privaten Charakter verständlich', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"success":false}', { status: 403 })));
    await expect(fetchDdbCharacter('12345678')).rejects.toThrow(/nicht öffentlich/);
  });

  it('packt die Antwort aus und prüft sie', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ success: true, message: 'ok', data: ddbGnomeWizardJson() })));
    expect((await fetchDdbCharacter('90000002')).name).toBe('Prüfling Tintenfass');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ success: true, data: { id: 'kaputt' } })));
    await expect(fetchDdbCharacter('90000002')).rejects.toThrow(/unerwartetes Format/);
  });
});
