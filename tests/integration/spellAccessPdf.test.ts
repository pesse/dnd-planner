/**
 * Deterministischer Test der Zauberwerte im PDF-Export — OHNE LLM.
 *
 * Gegenstück zu `spellAccessValues.test.ts`: dort entstehen die Werte für die Karte, hier
 * gehen sie durch die Klassenmerkmale-Felder des Taendler-PDFs. Kernzusicherung ist der
 * RUNDLAUF: der Import schneidet die Marke ab, sonst wüchse sie bei jedem Zyklus an.
 *
 *   npm run eval -- --eval spellAccessPdf
 */
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { characterSchema } from '../../src/lib/schemas/character';
import { exportCharacterToPdf } from '../../src/lib/pdf/characterExport';
import { parseCharacterData, stripSpellValues, withSpellValues } from '../../src/lib/pdf/characterFields';
import { resolveSpellAccess } from '../../src/lib/services/characterFeatures';
import type { SpellAccessValues } from '../../src/lib/services/spellAccess';
import { CHOSEN_LIST, MAGIC_INITIATE_KEY } from '../fixtures/fighter-l4-magic-initiate';

const TEMPLATE = 'vault/templates/ataendler_v2.8.2.pdf';

/** Die Notizzeile, die der Flow schreibt (`spellAccessNoteLines`) — ohne Zahl. */
const NOTE = 'Eingeweihter der Magie: Magier-Liste, Zauber über Charisma';
const MARK = ' (SG 13, Angriff +5)';

const values = (over: Partial<SpellAccessValues> = {}): SpellAccessValues => ({
  featureKey: MAGIC_INITIATE_KEY,
  featureDe: 'Eingeweihter der Magie',
  abilityDe: 'Charisma',
  saveDC: 13,
  attackBonus: 5,
  ...over,
});

/** Ein Kämpfer mit Talent-Link und beantwortetem Attribut — CHA +3, Übungsbonus 2. */
const fighterWithAccess = (classFeatures: string) =>
  characterSchema.parse({
    name: 'Bram Eisenhand',
    proficiencyBonus: 2,
    chaMod: 3,
    classFeatures,
    features: [
      { sourceKey: MAGIC_INITIATE_KEY, name: 'Eingeweihter der Magie', choice: '', choiceDe: '', gainedAt: 4, desc: '' },
      { sourceKey: MAGIC_INITIATE_KEY, name: '', choice: CHOSEN_LIST, choiceDe: '', gainedAt: 4, desc: '' },
      { sourceKey: MAGIC_INITIATE_KEY, name: '', choice: 'Charisma', choiceDe: '', gainedAt: 4, desc: '' },
    ],
  });

/** Export → Formularfelder als String-Map (dieselben sechs Zeilen wie `readPdfFields`). */
async function exportedFields(character: ReturnType<typeof fighterWithAccess>, rows: SpellAccessValues[]) {
  const template = new Uint8Array(readFileSync(TEMPLATE));
  const bytes = await exportCharacterToPdf(character, template, { spellAccess: rows });
  const form = (await PDFDocument.load(bytes, { ignoreEncryption: true })).getForm();
  const fields: Record<string, string> = {};
  for (const field of form.getFields()) {
    const name = field.getName();
    try {
      fields[name] = form.getTextField(name).getText() ?? '';
    } catch {
      try {
        fields[name] = form.getCheckBox(name).isChecked() ? 'On' : 'Off';
      } catch {
        fields[name] = '';
      }
    }
  }
  return fields;
}

describe('Zauberwerte im Klassenmerkmale-Text', () => {
  it('hängt die Werte an die vorhandene Notizzeile, ohne sie zu doppeln', () => {
    const text = `Zweiter Angriff: zwei Angriffe je Aktion.\n${NOTE}\nKampfstil: Verteidigung.`;
    const out = withSpellValues(text, [values()]);

    expect(out).toContain(`${NOTE}${MARK}`);
    // Kein zweiter Eintrag zum selben Merkmal, und die übrigen Zeilen unberührt.
    expect(out.match(/Eingeweihter der Magie/g)).toHaveLength(1);
    expect(out.split('\n')).toHaveLength(text.split('\n').length);
    expect(out).toContain('Kampfstil: Verteidigung.');
  });

  it('legt eine Zeile in derselben Form an, wenn die Notiz fehlt — und nur einmal', () => {
    const first = withSpellValues('Zweiter Angriff.', [values()]);
    expect(first).toBe(`Zweiter Angriff.\nEingeweihter der Magie: Zauber über Charisma${MARK}`);

    // Was der Import daraus macht, ist wieder eine gültige Notizzeile …
    const imported = stripSpellValues(first);
    expect(imported).toBe('Zweiter Angriff.\nEingeweihter der Magie: Zauber über Charisma');
    // … die der nächste Export anreichert statt eine zweite anzulegen.
    const second = withSpellValues(imported, [values()]);
    expect(second).toBe(first);
    expect(second.match(/Eingeweihter der Magie/g)).toHaveLength(1);
  });

  it('rät nichts ohne beantwortetes Attribut (keine Zeilen → Text zeichengleich)', () => {
    const text = `Zweiter Angriff.\n${NOTE}`;
    expect(withSpellValues(text, [])).toBe(text);
    expect(withSpellValues('', [])).toBe('');
  });

  it('schneidet genau die Marke ab, nicht jede Klammer', () => {
    expect(stripSpellValues(`${NOTE}${MARK}`)).toBe(NOTE);
    // Prosa mit Klammern (und mit Zahlen) bleibt stehen — die Marke hat eine feste Form.
    const prose = 'Handaufheben (1W10 + Stufe, 2× je Rast) heilt.';
    expect(stripSpellValues(prose)).toBe(prose);
    expect(stripSpellValues('Zauber über Charisma (SG 13)')).toBe('Zauber über Charisma (SG 13)');
  });

  it('trägt zwei Zugänge getrennt, statt beide an dieselbe Zeile zu hängen', () => {
    const other = values({ featureKey: 'srd-2024_ritual-caster', featureDe: 'Ritualwirker', saveDC: 14, attackBonus: 6 });
    const out = withSpellValues(`${NOTE}\nRitualwirker: Zauber über Charisma`, [values(), other]);

    expect(out).toContain(`${NOTE}${MARK}`);
    expect(out).toContain('Ritualwirker: Zauber über Charisma (SG 14, Angriff +6)');
  });
});

describe('Rundlauf durch das echte Taendler-PDF', () => {
  it('schreibt die gerechneten Werte in die Klassenmerkmale-Felder', async () => {
    const c = fighterWithAccess(`Zweiter Angriff.\n${NOTE}`);
    const rows = await resolveSpellAccess({
      features: c.features,
      proficiencyBonus: c.proficiencyBonus,
      mods: { str: c.strMod, ges: c.gesMod, kon: c.konMod, int: c.intMod, wei: c.weiMod, cha: c.chaMod },
    });
    // Die Zahlen kommen aus dem Ledger, nicht aus dem Test: 8 + ÜB 2 + CHA 3.
    expect(rows).toHaveLength(1);
    expect([rows[0].saveDC, rows[0].attackBonus]).toEqual([13, 5]);

    const fields = await exportedFields(c, rows);
    expect(fields.Klassenmerkmale1).toContain(`${NOTE}${MARK}`);
    // Der Klassen-Zauberblock bleibt leer: der Zugang steht NEBEN ihm, nicht darin.
    expect(fields.AttributZauberwirken).toBe('');
    expect(fields.ZauberRettungswurfSG).toBe('');
    expect(fields.ZauberAngriffsbonus).toBe('');
  });

  it('wächst über Export → Import → Export nicht an', async () => {
    const original = `Zweiter Angriff.\n${NOTE}`;
    const c = fighterWithAccess(original);
    const rows = [values()];

    const first = await exportedFields(c, rows);
    const back = parseCharacterData(first);
    // Der Import stellt den gespeicherten Stand wieder her — die Marke ist weg.
    expect(back.classFeatures).toBe(original);

    const second = await exportedFields(fighterWithAccess(back.classFeatures), rows);
    expect(second.Klassenmerkmale1).toBe(first.Klassenmerkmale1);
    expect(second.Klassenmerkmale2).toBe(first.Klassenmerkmale2);
  });

  it('nimmt am Überlauf in Feld 2 teil, statt verloren zu gehen', async () => {
    // Über dem Trenn-Limit (700) und mit der Notiz am Ende — der Fall, in dem die Marke
    // ins zweite Feld rutscht. Verloren gehen darf sie nicht.
    const long = `${'Zweiter Angriff: zwei Angriffe je Aktion.\n'.repeat(20)}${NOTE}`;
    const fields = await exportedFields(fighterWithAccess(long), [values()]);

    const both = `${fields.Klassenmerkmale1}\n${fields.Klassenmerkmale2}`;
    expect(both).toContain(`${NOTE}${MARK}`);
    expect(fields.Klassenmerkmale2).not.toBe('');
    expect(parseCharacterData(fields).classFeatures.replace(/\n+/g, '\n')).toBe(long);
  });
});
