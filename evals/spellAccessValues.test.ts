/**
 * Deterministischer Test der Zauberwerte eines merkmals-gewährten Zugangs — OHNE LLM.
 *
 * Gegenstück zu `levelUpFeatAccess.test.ts`: dort landet die Antwort im Merkmals-Ledger,
 * hier wird sie gelesen. Kernzusicherung: SG und Angriffsbonus entstehen zur Anzeigezeit,
 * nichts wird gespeichert — sonst altern sie mit dem Übungsbonus.
 *
 *   npm run eval -- --eval spellAccessValues
 */
import { describe, expect, it } from 'vitest';
import { characterSchema } from '../src/lib/schemas/character';
import { SHEET_NOTE_MAX_CHARS } from '../src/lib/schemas/levelUp';
import { resolveSpellAccess } from '../src/lib/services/characterFeatures';
import {
  answeredAbility,
  spellAbilityChoiceId,
  spellAccessGrantOf,
  spellAccessNoteLines,
  spellAccessValues,
  spellListChoiceId,
  type SpellAccessGrant,
} from '../src/lib/services/spellAccess';
import { spellSaveDC } from '../src/lib/services/spellcasting';
import { CHOSEN_LIST, loadMagicInitiate, MAGIC_INITIATE_KEY } from './fixtures/fighter-l4-magic-initiate';

/** Attributs-Modifikatoren wie am Charakter (`intMod` …): CHA +3 ist der Prüfwert. */
const MODS = { str: 1, ges: 2, kon: 1, int: 0, wei: -1, cha: 3 } as const;
const PROF_BONUS = 2;

const grantOfMagicInitiate = async (): Promise<SpellAccessGrant> => {
  const feat = await loadMagicInitiate();
  const grant = spellAccessGrantOf({
    key: feat.sourceKey,
    name: feat.name,
    nameDe: feat.nameDe,
    grantsChoice: feat.grantsChoice,
  });
  if (!grant) throw new Error('vault/feats/magic-initiate.json deklariert keinen spellAccess');
  return grant;
};

/** Das Ledger, wie `buildDoc`/`assembleCharacter` es schreiben: Liste UND Attribut. */
const ledgerOf = (ability: string) => [
  { sourceKey: MAGIC_INITIATE_KEY, choice: CHOSEN_LIST },
  { sourceKey: MAGIC_INITIATE_KEY, choice: ability },
];

describe('Zauberwerte eines deklarierten Zauber-Zugangs', () => {
  it('rechnet SG und Angriffsbonus aus dem Ledger-Attribut', async () => {
    const grant = await grantOfMagicInitiate();
    const values = spellAccessValues(grant, ledgerOf('Charisma'), MODS, PROF_BONUS);

    expect(values?.abilityDe).toBe('Charisma');
    expect(values?.featureDe).toMatch(/magiekundig/i);
    // 8 + Übungsbonus 2 + CHA 3 bzw. 2 + 3 — die Zahlen, nicht die Formel gegen sich selbst.
    expect(values?.saveDC).toBe(13);
    expect(values?.attackBonus).toBe(5);
  });

  it('nimmt den steigenden Übungsbonus mit (der Grund gegen eine gespeicherte Zahl)', async () => {
    const grant = await grantOfMagicInitiate();
    const l4 = spellAccessValues(grant, ledgerOf('Charisma'), MODS, 2);
    const l5 = spellAccessValues(grant, ledgerOf('Charisma'), MODS, 3);

    expect(l4?.saveDC).toBe(13);
    expect(l5?.saveDC).toBe(14);
    expect(l5?.attackBonus).toBe(6);
    expect(l5?.saveDC).toBe(spellSaveDC(3, MODS.cha));
  });

  it('rät nichts, solange das Attribut offen ist', async () => {
    const grant = await grantOfMagicInitiate();
    // Nur die Liste beantwortet — kein Attribut, also keine Zahl.
    expect(spellAccessValues(grant, [{ sourceKey: MAGIC_INITIATE_KEY, choice: CHOSEN_LIST }], MODS, PROF_BONUS)).toBeNull();
    expect(spellAccessValues(grant, [], MODS, PROF_BONUS)).toBeNull();
    expect(answeredAbility(grant, [])).toBeNull();
  });

  /**
   * Der Grund, warum die DEKLARATION entscheidet und nicht der Wortlaut: eine ASI-Wahl
   * speichert ebenfalls „Charisma" im Ledger. Ein Namensvergleich würde sie mitgreifen.
   */
  it('erkennt die Antwort an der Deklaration, nicht am Attributsnamen', async () => {
    const grant = await grantOfMagicInitiate();

    // Stärke steht nicht in der Deklaration (Int/Wei/Cha) → keine gültige Antwort.
    expect(answeredAbility(grant, ledgerOf('Strength'))).toBeNull();
    // Dasselbe Wort, aber zu einem ANDEREN Merkmal → zählt nicht.
    expect(answeredAbility(grant, [{ sourceKey: 'srd-2024_ability-score-improvement', choice: 'Charisma' }])).toBeNull();
    expect(answeredAbility(grant, ledgerOf('Wisdom'))).toBe('Wisdom');
  });

  it('schreibt eine deutsche Bogen-Notiz OHNE Zahl, im Längenbudget', async () => {
    const grant = await grantOfMagicInitiate();
    const answers = {
      [spellListChoiceId(grant)]: CHOSEN_LIST,
      [spellAbilityChoiceId(grant)]: 'Charisma',
    };
    const [line, ...rest] = spellAccessNoteLines([grant], answers);

    expect(rest).toEqual([]);
    expect(line).toContain('Charisma');
    expect(line).toContain('Magier-Liste');
    // Keine Zahl: SG und Angriffsbonus hängen am Übungsbonus, der Freitext wird nicht
    // nachgerechnet — eine eingefrorene „13" wäre ab Stufe 5 falsch.
    expect(line).not.toMatch(/\d/);
    expect(line.length).toBeLessThanOrEqual(SHEET_NOTE_MAX_CHARS);
    expect(line).not.toMatch(/\n/);
  });

  it('schweigt in der Notiz, solange das Attribut offen ist', async () => {
    const grant = await grantOfMagicInitiate();
    expect(spellAccessNoteLines([grant], { [spellListChoiceId(grant)]: CHOSEN_LIST })).toEqual([]);
  });

  /**
   * Der Weg, den die Karte nimmt: gespeicherter Charakter → Talent-Bibliothek → Werte.
   * Erst er beweist, dass die Anzeige ohne ein neues Feld auskommt.
   */
  it('löst die Werte am gespeicherten Charakter auf (Talent-Link + Ledger)', async () => {
    const c = characterSchema.parse({
      name: 'Bram Eisenhand',
      proficiencyBonus: PROF_BONUS,
      chaMod: MODS.cha,
      features: [
        { sourceKey: MAGIC_INITIATE_KEY, name: 'Eingeweihter der Magie', choice: '', choiceDe: '', gainedAt: 4, desc: '' },
        ...ledgerOf('Charisma').map((e) => ({ ...e, name: '', choiceDe: '', gainedAt: 4, desc: '' })),
      ],
    });

    const rows = await resolveSpellAccess({
      features: c.features,
      proficiencyBonus: c.proficiencyBonus,
      mods: { str: c.strMod, ges: c.gesMod, kon: c.konMod, int: c.intMod, wei: c.weiMod, cha: c.chaMod },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].featureKey).toBe(MAGIC_INITIATE_KEY);
    expect(rows[0].abilityDe).toBe('Charisma');
    expect(rows[0].saveDC).toBe(13);
    // Der Klassen-Zauberblock bleibt unberührt — der Zugang steht NEBEN ihm, nicht darin.
    expect(c.spells.spellcastingAbility).toBe('');
    expect(c.spells.saveDC).toBe(0);
  });

  it('liefert nichts für einen Charakter ohne Talent mit Zauber-Zugang', async () => {
    const c = characterSchema.parse({ name: 'Ohne Magie' });
    const rows = await resolveSpellAccess({
      features: c.features,
      proficiencyBonus: c.proficiencyBonus,
      mods: { str: 0, ges: 0, kon: 0, int: 0, wei: 0, cha: 0 },
    });
    expect(rows).toEqual([]);
  });
});
