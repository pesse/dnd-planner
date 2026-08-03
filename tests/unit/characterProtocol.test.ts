/**
 * Charakterisierungs-Test: hält die Ausgabe von `buildCharacterProtocol` Zeile für Zeile
 * fest. Der Übungs-Katalog steht dreimal von Hand im Code (Protokoll, LLM-Kontext, PDF) —
 * dieser Snapshot ist das Netz für die Zusammenlegung.
 *
 *   npm run test -- characterProtocol
 */
import { describe, expect, it } from 'vitest';
import { buildCharacterProtocol } from '../../src/lib/services/characterProtocol';
import {
  allProficienciesCharacter,
  allProficienciesDecisions,
} from '../fixtures/character-all-proficiencies';

describe('buildCharacterProtocol', () => {
  it('gruppiert den vollständigen Bogen', () => {
    const groups = buildCharacterProtocol(allProficienciesCharacter, {
      decisions: allProficienciesDecisions,
    });

    expect(groups).toMatchInlineSnapshot(`
      [
        {
          "heading": "Attribute",
          "lines": [
            "Stärke 16 (+3)",
            "Geschicklichkeit 12 (+1)",
            "Konstitution 14 (+2)",
            "Intelligenz 10 (+0)",
            "Weisheit 13 (+1)",
            "Charisma 18 (+4)",
          ],
        },
        {
          "heading": "Werte",
          "lines": [
            "Trefferpunkte: 44",
            "Trefferwürfel: 5W10",
            "Bewegungsrate: 9 m",
            "Übungsbonus: +3",
          ],
        },
        {
          "heading": "Geübte Fertigkeiten",
          "lines": [
            "Athletik",
            "Überzeugen",
          ],
        },
        {
          "heading": "Expertise",
          "lines": [
            "Einschüchtern",
          ],
        },
        {
          "heading": "Rettungswurf-Übungen",
          "lines": [
            "Weisheit",
            "Charisma",
          ],
        },
        {
          "heading": "Waffen",
          "lines": [
            "Einfache Waffen",
            "Kriegswaffen",
            "Kurzschwert",
            "Kriegswaffen mit Finesse",
          ],
        },
        {
          "heading": "Rüstung",
          "lines": [
            "Leichte Rüstung",
            "Mittelschwere Rüstung",
            "Schwere Rüstung",
            "Schilde",
          ],
        },
        {
          "heading": "Waffenbeherrschung",
          "lines": [
            "Langschwert",
            "Kurzschwert",
          ],
        },
        {
          "heading": "Werkzeuge",
          "lines": [
            "Schmiedewerkzeug",
            "Würfelspiel",
          ],
        },
        {
          "heading": "Sprachen",
          "lines": [
            "Gemeinsprache",
            "Elfisch",
            "Zwergisch",
          ],
        },
        {
          "heading": "Zauber",
          "lines": [
            "Zauberplätze: Grad 1: 4, Grad 2: 2",
            "Zaubertricks: Licht",
            "Vorbereitet: Göttliche Gunst (Grad 1), Waffe des Glaubens (Grad 2)",
            "Im Zauberbuch (nicht vorbereitet): Heldentum (Grad 1)",
          ],
        },
        {
          "heading": "Merkmals-Entscheidungen",
          "lines": [
            "Kampfstil: Verteidigung",
            "Eid der Hingabe",
          ],
        },
        {
          "heading": "Ausrüstung",
          "lines": [
            "Langschwert",
            "Kettenhemd",
            "5× Fackel",
            "150 Goldmünzen",
          ],
        },
      ]
    `);
  });

  it('lässt leere Gruppen weg', () => {
    const groups = buildCharacterProtocol({
      ...allProficienciesCharacter,
      skills: {},
      masteries: [],
      tools: [],
      languages: [],
      inventory: [],
      currency: { km: '', sm: '', em: '', gm: '', pm: '' },
      weiSaveProf: false,
      chaSaveProf: false,
      proficiencies: {
        simpleWeapons: false,
        martialWeapons: false,
        individualWeapons: [],
        otherWeapons: '   ',
        lightArmor: false,
        mediumArmor: false,
        heavyArmor: false,
        shields: false,
      },
      spells: { ...allProficienciesCharacter.spells, slots: [], cantrips: [], byLevel: {} },
    });

    expect(groups.map((g) => g.heading)).toMatchInlineSnapshot(`
      [
        "Attribute",
        "Werte",
      ]
    `);
  });
});
