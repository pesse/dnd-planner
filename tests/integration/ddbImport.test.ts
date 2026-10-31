/**
 * Import eines D&D-Beyond-Charakters gegen die echte Bibliothek.
 *
 *   npm run test -- ddbImport
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { buildDdbCharacter, type DdbImportLibraries, type DdbImportResult } from '../../src/lib/services/ddbImport/assemble';
import { loadDdbImportLibraries } from '../../src/lib/services/ddbImport/loadLibraries';
import { characterSchema } from '../../src/lib/schemas/characterSchema';
import { parseDdbJson } from '../../src/lib/services/ddbImport/parseJson';
import { searchLibrary } from '../../src/lib/services/ddbImport/session';
import { ddbCharacterJsonSchema } from '../../src/lib/schemas/ddbCharacterJson';
import { BOOK_SOURCE_ID, ddbGnomeWizardJson } from '../fixtures/ddbCharacterJson';

const sheetOf = (raw = ddbGnomeWizardJson()) => parseDdbJson(ddbCharacterJsonSchema.parse(raw));
const NOW = new Date('2026-10-31T12:00:00Z');

let libs: DdbImportLibraries;
beforeAll(async () => { libs = await loadDdbImportLibraries(); });

describe('D&D-Beyond-Import', () => {
  let result: DdbImportResult;
  beforeAll(async () => { result = await buildDdbCharacter(sheetOf(), libs, { now: NOW }); });

  it('ergibt einen gültigen, verknüpften Charakter', () => {
    const c = result.character;
    expect(() => characterSchema.parse(c)).not.toThrow();
    expect(c._importedFrom).toBe('dndbeyond-90000002');
    expect(c.classes).toMatchObject([{ sourceKey: 'srd-2024_wizard', level: 2 }]);
    expect(c.species.sourceKey).toBe('srd-2024_gnome');
    expect(c.backgroundRef.sourceKey).toBe('srd-2024_sage');
    expect(c.features).toContainEqual(expect.objectContaining({
      sourceKey: 'srd-2024_gnome_gnomish-lineage', choice: 'Forest Gnome', choiceId: expect.stringMatching(/^optionlist_/),
    }));
  });

  it('verlinkt das Hintergrund-Talent nicht ein zweites Mal', () => {
    expect(result.character.features.some((f) => f.sourceKey?.includes('magic-initiate'))).toBe(false);
  });

  it('übernimmt Werte, Fertigkeiten und Ausrüstungsstatus', () => {
    const c = result.character;
    expect(c).toMatchObject({ ac: '12', hpMax: '14', hitDice: '2W6', speed: '9', alleskoenner: false });
    expect(c.skills['Nachforschungen']).toEqual({ value: 7, prof: true, exp: true });
    expect(c.proficiencies.simpleWeapons).toBe(true);
    const dagger = c.inventory.filter((l) => l.sourceKey === 'srd-2024_dagger');
    expect(dagger).toMatchObject([{ count: '2', equipped: true }]);
    expect(c.inventory.find((l) => l.sourceKey === 'srd-2024_lantern-bullseye')?.equipped).toBeUndefined();
    expect(c.inventory.some((l) => l.sourceKey?.startsWith('srd-2024_calligrapher'))).toBe(true);
  });

  it('schreibt die Hintergrundgeschichte in details.md', () => {
    expect(result.character.ideals.endsWith('Büchern')).toBe(true);
    expect(result.details).toContain('## Hintergrundgeschichte');
    expect(result.details).toContain('Die Bibliothek von Prüfstadt');
  });

  it('meldet alles Unverknüpfte als Befund mit Buchquelle', () => {
    const byId = new Map(result.findings.map((f) => [f.id, f]));
    expect(byId.get('feat:inkbound pact')).toMatchObject({ kind: 'feat', origin: { sourceId: BOOK_SOURCE_ID } });
    expect(byId.get('item:quill of endless ink')).toMatchObject({ kind: 'item', reason: 'missing' });
    expect(byId.get('item:glitzerstaub')?.origin?.homebrew).toBe(true);
    expect(byId.get('spell:zauber der prüfstadt')).toMatchObject({ kind: 'spell', context: 'Wizard' });
    expect(result.findings.some((f) => f.kind === 'class' || f.kind === 'species' || f.kind === 'background')).toBe(false);
  });

  it('behält ohne Entscheidung alles als Freitext', () => {
    const c = result.character;
    expect(c.features).toContainEqual(expect.objectContaining({ sourceKey: '', name: 'Inkbound Pact', desc: expect.stringContaining('pact in ink') }));
    expect(c.inventory.find((l) => l.name === 'Glitzerstaub')?.sourceKey).toBeUndefined();
    expect(c.spellcasting.manual?.extra).toEqual(expect.arrayContaining(['srd-2024_shield', 'srd-2024_mage-hand', 'srd-2024_speak-with-animals']));
    expect(result.details).toContain('## Zauber ohne Bibliothekseintrag\n\n### Zauber der Prüfstadt');
  });
});

describe('D&D-Beyond-Import: Entscheidungen', () => {
  it('verknüpft, lässt weg und hält Freitext fest', async () => {
    const { character, details } = await buildDdbCharacter(sheetOf(), libs, {
      resolutions: {
        'item:quill of endless ink': { action: 'link', key: 'srd-2024_ink-pen' },
        'item:glitzerstaub': { action: 'drop' },
        'feat:inkbound pact': { action: 'drop' },
        'spell:zauber der prüfstadt': { action: 'link', key: 'srd-2024_magic-missile' },
      },
    });
    expect(character.inventory.find((l) => l.sourceKey === 'srd-2024_ink-pen')).toMatchObject({ equipped: true });
    expect(character.inventory.some((l) => l.name === 'Glitzerstaub')).toBe(false);
    expect(character.features.some((f) => f.name === 'Inkbound Pact')).toBe(false);
    expect(character.spellcasting.manual?.extra).toContain('srd-2024_magic-missile');
    expect(details).not.toContain('Zauber ohne Bibliothekseintrag');
  });

  it('verknüpft eine Klasse, die der Name nicht trifft', async () => {
    const raw = ddbGnomeWizardJson();
    raw.classes[0].definition.name = 'Arcanist';
    const draft = await buildDdbCharacter(sheetOf(raw), libs);
    const finding = draft.findings.find((f) => f.kind === 'class');
    expect(finding?.id).toBe('class:0');
    expect(searchLibrary(libs, finding!, 'magier').map((o) => o.key)).toContain('srd-2024_wizard');
    const { character } = await buildDdbCharacter(sheetOf(raw), libs, { resolutions: { 'class:0': { action: 'link', key: 'srd-2024_wizard' } } });
    expect(character.classes[0]).toMatchObject({ sourceKey: 'srd-2024_wizard', level: 2 });
  });

  it('verknüpft die Unterklasse unter ihrer Grundklasse', async () => {
    const raw = ddbGnomeWizardJson();
    raw.classes[0].level = 3;
    raw.classes[0].subclassDefinition = { name: 'Evoker' };
    const { character } = await buildDdbCharacter(sheetOf(raw), libs);
    expect(character.classes[0]).toMatchObject({ sourceKey: 'srd-2024_wizard', subclassKey: expect.stringContaining('evoker'), level: 3 });
  });

  it('übernimmt die Optionswahl eines Klassenmerkmals', async () => {
    const raw = ddbGnomeWizardJson();
    raw.classes = [{
      id: 9002, level: 1, definition: { name: 'Druid', hitDice: 8, canCastSpells: true }, subclassDefinition: null,
      classFeatures: [{ definition: { id: 501, name: 'Primal Order', requiredLevel: 1 } }],
    }];
    raw.choices.class = [{ componentId: 501, componentTypeId: 12168134, type: 2, optionValue: 7002, options: [{ id: 7001, label: 'Magician' }, { id: 7002, label: 'Warden' }] }];
    const { character } = await buildDdbCharacter(sheetOf(raw), libs);
    expect(character.features).toContainEqual(expect.objectContaining({ sourceKey: 'srd-2024_druid_primal-order', choice: 'Warden', gainedAt: 1 }));
  });
});
