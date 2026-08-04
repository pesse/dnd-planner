/**
 * Charakterisierungs-Test der dritten Übungs-Senke: die sieben Häkchen und das eine
 * Textfeld, die `writeProficiencies` in die Taendler-Vorlage schreibt. Getestet wird über
 * den echten Export, weil `writeProficiencies` und der `FieldSink` modulintern sind.
 *
 *   npm run test -- characterProficienciesPdf
 */
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { Character } from '../../src/lib/schemas/characterSchema';
import { exportCharacterToPdf } from '../../src/lib/pdf/characterExport';
import { allProficienciesCharacter } from '../fixtures/character-all-proficiencies';

const TEMPLATE = 'vault/templates/ataendler_v2.8.2.pdf';

const PROFICIENCY_FIELDS = [
  'EinfachWaffenProf',
  'KriegswaffenProf',
  'SonstigeWaffenProf',
  'SonstigeWaffen',
  'LeichteRüstungProf',
  'MittlereRüstungProf',
  'SchwereRüstungProf',
  'SchildeProf',
] as const;

/** Nur die Übungs-Felder, als Häkchen-Zustand bzw. Text. */
async function proficiencyFields(c: Character): Promise<Record<string, string | boolean>> {
  const template = new Uint8Array(readFileSync(TEMPLATE));
  const form = (await PDFDocument.load(await exportCharacterToPdf(c, template), {
    ignoreEncryption: true,
  })).getForm();

  const out: Record<string, string | boolean> = {};
  for (const name of PROFICIENCY_FIELDS) {
    try {
      out[name] = form.getTextField(name).getText() ?? '';
    } catch {
      out[name] = form.getCheckBox(name).isChecked();
    }
  }
  return out;
}

describe('Übungen im Taendler-PDF', () => {
  it('setzt alle Häkchen und legt Einzelwaffe plus Freitext in EIN Feld', async () => {
    expect(await proficiencyFields(allProficienciesCharacter)).toMatchInlineSnapshot(`
      {
        "EinfachWaffenProf": true,
        "KriegswaffenProf": true,
        "LeichteRüstungProf": true,
        "MittlereRüstungProf": true,
        "SchildeProf": true,
        "SchwereRüstungProf": true,
        "SonstigeWaffen": "Kurzschwert, Kriegswaffen mit Finesse",
        "SonstigeWaffenProf": true,
      }
    `);
  });

  it('lässt das Sonstige-Häkchen weg, wenn weder Einzelwaffe noch Freitext da sind', async () => {
    const fields = await proficiencyFields({
      ...allProficienciesCharacter,
      proficiencies: {
        ...allProficienciesCharacter.proficiencies,
        individualWeapons: [],
        otherWeapons: '   ',
      },
    });

    expect(fields.SonstigeWaffen).toBe('');
    expect(fields.SonstigeWaffenProf).toBe(false);
  });
});
