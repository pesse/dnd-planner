/**
 * Charakterisierungs-Test: hält das Markdown fest, das `buildCharacterContext` einem LLM
 * vorlegt — insbesondere den Übungs-Abschnitt, den Protokoll und PDF ein zweites und
 * drittes Mal von Hand aufzählen.
 *
 * Integration statt Unit, weil die Funktion async ist und die Merkmalsauflösung über den
 * `invoke`-Shim gegen den Vault läuft; der Charakter trägt bewusst keine Bibliotheks-Links,
 * damit der Abschnitt „Features & Traits" leer bleibt.
 *
 *   npm run test -- characterContext
 */
import { describe, expect, it } from 'vitest';
import { buildCharacterContext } from '../../src/lib/services/characterContext';
import { allProficienciesCharacter } from '../fixtures/character-all-proficiencies';

describe('buildCharacterContext', () => {
  it('schreibt den vollständigen Bogen als Markdown', async () => {
    const md = await buildCharacterContext(allProficienciesCharacter, 'character');

    expect(md).toMatchInlineSnapshot(`
      "## Character: Miriel Sturmklinge
      - Player: Ada
      - Species: Halbelf
      - Background: Adlige
      - Class & Level: Paladin 5
      - XP: 6500

      ### Abilities
      - STR 16 (+3)
      - DEX 12 (+1)
      - CON 14 (+2)
      - INT 10 (+0)
      - WIS 13 (+1, Rettungswurf geübt)
      - CHA 18 (+4, Rettungswurf geübt)

      ### Combat
      - AC: 18
      - Initiative: +1
      - Speed: 9 m
      - HP: 38/44 (temp 5)
      - Hit Dice: 5W10
      - Proficiency Bonus: +3
      - Passive Perception: 11

      ### Skill Proficiencies
      - Athletik: +6
      - Einschüchtern: +10 (Expertise)
      - Überzeugen: +7

      ### Proficiencies
      - Weapons: Einfache Waffen, Kriegswaffen, Kurzschwert, Kriegswaffen mit Finesse
      - Armor: Leichte Rüstung, Mittelschwere Rüstung, Schwere Rüstung, Schilde
      - Weapon Masteries: Langschwert, Kurzschwert
      - Languages: Gemeinsprache, Elfisch, Zwergisch
      - Tools: Schmiedewerkzeug, Würfelspiel
      - Jack of all Trades: ja

      ### Attacks
      - **Langschwert** — Angriff +6, Schaden 1W8+3 Hieb, Reichweite Nahkampf

      ### Spellcasting
      - Source: Paladin — Ability: Charisma, Save DC: 15, Attack Bonus: +7
      - Slots:
        - Grad 1: 4
        - Grad 2: 2
      - Zaubertricks: Licht
      - Grad 1: Göttliche Gunst (vorbereitet), Heldentum
      - Grad 2: Waffe des Glaubens (vorbereitet)

      ### Equipment
      - Inventory:
        - Langschwert (×1, 1,5)
        - Kettenhemd (×1, 27,5)
        - Fackel (×5, 0,5)
      - Coins: 150 GM, 0 EM, 8 SM, 12 KM
      - Notes: Das Kettenhemd trägt das Wappen des Ordens.

      ### Personality
      - Wesenszüge: Spricht leise und langsam.
      - Ideale: Ein gegebenes Wort wiegt schwerer als ein Schwert.
      - Bindungen: Dem Orden von Sankt Aldric verpflichtet.
      - Makel: Vergibt sich selbst nichts.

      ### Personal Details
      - Alter: 34
      - Geschlecht: weiblich
      - Gesinnung: Rechtschaffen Gut
      - Größenkategorie: Mittelgroß
      - Körpergröße: 1,78 m

      ### Class Features (character sheet notes)
      Göttliches Machtwort: 5 Punkte Heilung je lange Rast."
    `);
  });

  it('lässt Waffen- und Rüstungszeile weg, wenn nichts geübt ist', async () => {
    const md = await buildCharacterContext(
      {
        ...allProficienciesCharacter,
        masteries: [],
        tools: [],
        languages: [],
        alleskoenner: false,
        proficiencies: {
          simpleWeapons: false,
          martialWeapons: false,
          individualWeapons: [],
          otherWeapons: '',
          lightArmor: false,
          mediumArmor: false,
          heavyArmor: false,
          shields: false,
        },
      },
      'character',
    );

    expect(md).not.toContain('### Proficiencies');
  });
});
