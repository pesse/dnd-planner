/**
 * Das Bündel des Charakterbogens über den ECHTEN Vault, ohne LLM. Nachfolger von
 * `spellAccessPdf`: die Zauberwerte werden hier gerechnet und in die Zauberseite gedruckt,
 * statt in `classFeatures` zurückgeschrieben zu werden — die Idempotenz-Frage entfällt damit.
 *
 *   npm run test -- characterPrintData
 */
import { describe, expect, it } from 'vitest';
import { characterSchema } from '../../src/lib/schemas/characterSchema';
import { getClasses } from '../../src/lib/classLibrary';
import { getProgressionByKey } from '../../src/lib/services/classProgression';
import { CLASS_RESOURCE_COLUMNS } from '../../src/lib/domain/classResources';
import { loadCharacterPrintData } from '../../src/lib/print/character/data';
import { buildCharacterSheetHtml } from '../../src/lib/print/character/document';
import { defaultSelection, sheetSections } from '../../src/lib/print/character/sections';
import { CHOSEN_LIST, MAGIC_INITIATE_KEY } from '../fixtures/fighter-l4-magic-initiate';

const sheetOf = async (character: Parameters<typeof loadCharacterPrintData>[0]['character']) => {
  const data = await loadCharacterPrintData({ character });
  return { data, html: buildCharacterSheetHtml(data, defaultSelection(sheetSections(data))) };
};

type Sheet = Awaited<ReturnType<typeof sheetOf>>['data'];

const poolFor = (data: Sheet, label: string) => data.resources.find((p) => p.labelDe === label);

const valueFor = (data: Sheet, label: string) =>
  data.values.flatMap((r) => r.tracks).find((t) => t.label === label);

describe('Charakterbogen-Bündel über den echten Vault', () => {
  it('zieht die Zauberpunkte des Zauberers als Kästchen-Vorrat aus der Klassentabelle', async () => {
    const { data, html } = await sheetOf(characterSchema.parse({
      name: 'Nyx Funkenhand',
      classes: [{ sourceKey: 'srd-2024_sorcerer', name: 'Zauberer', level: 5 }],
    }));

    expect(poolFor(data, 'Zauberpunkte')).toMatchObject({ kind: 'points', max: [5] });
    // Der Vorrat steht am Kopf des Zauberblatts, neben den Zauberplätzen.
    expect(html.split('class="sp-top"')[1]).toContain('<span class="btitle">Zauberpunkte</span>');
  });

  it('bietet dem Zauberer seinen Metamagie-Pool an', async () => {
    const { data } = await sheetOf(characterSchema.parse({
      name: 'Nyx Funkenhand',
      classes: [{ sourceKey: 'srd-2024_sorcerer', name: 'Zauberer', level: 5 }],
    }));

    expect(data.pools.map((p) => p.featureKey)).toContain('srd-2024_sorcerer_metamagic');
  });

  it('druckt den Hinterhältigen Angriff des Schurken als Wert, nicht als Kästchen', async () => {
    const { data } = await sheetOf(characterSchema.parse({
      name: 'Vex Nachtschritt',
      classes: [{ sourceKey: 'srd-2024_rogue', name: 'Schurke', level: 3 }],
    }));

    expect(valueFor(data, 'Hinterhältiger Angriff')).toMatchObject({ text: '2W6' });
  });

  it('trägt SG und Angriffsbonus des Talent-Zugangs in die Zauberseite', async () => {
    const { data, html } = await sheetOf(characterSchema.parse({
      name: 'Bram Eisenhand',
      proficiencyBonus: 2,
      mods: { cha: 3 },
      classes: [{ sourceKey: 'srd-2024_fighter', name: 'Kämpfer', level: 4 }],
      features: [
        { sourceKey: MAGIC_INITIATE_KEY, name: 'Eingeweihter der Magie', choice: '', choiceDe: '', gainedAt: 4, desc: '' },
        { sourceKey: MAGIC_INITIATE_KEY, name: '', choice: CHOSEN_LIST, choiceDe: '', gainedAt: 4, desc: '' },
        { sourceKey: MAGIC_INITIATE_KEY, name: '', choice: 'Charisma', choiceDe: '', gainedAt: 4, desc: '' },
      ],
    }));

    expect(html).toContain('<span class="cast-lbl">Rettungswurf-SG</span>13');
    expect(html).toContain('<span class="cast-lbl">Angriffsbonus</span>+5');
  });

  it('druckt bei den Klassenmerkmalen den Freitext, nicht die aufgelöste Liste', async () => {
    const { data, html } = await sheetOf(characterSchema.parse({
      name: 'Lior Silberzunge',
      classes: [{ sourceKey: 'srd-2024_bard', name: 'Barde', subclassKey: 'srd-2024_college-of-lore', level: 6 }],
      classFeatures: 'Bardische Inspiration: W8, 4× pro Rast.',
    }));
    const printed = html.split('<span class="btitle">Klassenmerkmale</span>')[1].split('</section>')[0];

    expect(data.features.classGroups.length).toBeGreaterThan(0);
    expect(printed).toContain('Bardische Inspiration: W8, 4× pro Rast.');
    expect(printed).not.toContain('feat-name');
  });

  it('degradiert ohne Klassenlink auf leere Blöcke, statt zu werfen', async () => {
    const { data, html } = await sheetOf(characterSchema.parse({ name: 'Namenlos', classLevel: 'Homebrew 3' }));

    expect(data.resources).toEqual([]);
    expect(data.pools).toEqual([]);
    expect(data.grouped.sources).toEqual([]);
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('kennt jede Zahlenspalte, die der Vault in einer Klassentabelle führt', async () => {
    const classes = await getClasses();
    const unknown = new Set<string>();
    for (const info of classes) {
      const prog = info.key ? await getProgressionByKey(info.key) : null;
      for (const level of prog?.levels ?? []) {
        for (const column of Object.keys(level.columns)) {
          if (!(column in CLASS_RESOURCE_COLUMNS)) unknown.add(column);
        }
      }
    }

    expect([...unknown]).toEqual([]);
  });
});
