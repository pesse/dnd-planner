/**
 * Der Upsert-Schlüssel des Merkmals-Ledgers: (Merkmal, Vergabe-Stufe, FRAGE). Ohne die Frage
 * überschrieben sich zwei Wahlen desselben Merkmals auf derselben Stufe — und der Talent-Link
 * gleich mit, denn er steht unter demselben Key und derselben Stufe.
 *
 *   npm run test -- featureChoiceUpsert
 */
import { describe, expect, it } from 'vitest';
import { characterSchema, type Character, type CharacterFeatureEntry } from '../../src/lib/schemas/characterSchema';
import type { Change } from '../../src/lib/schemas/levelUp';
import { applyChanges } from '../../src/lib/services/applyChanges';

const FEAT = 'srd-2024_magic-initiate';
const LIST_ID = 'spellaccess_srd-2024_magic-initiate_list';
const ABILITY_ID = 'spellaccess_srd-2024_magic-initiate_ability';

const character = (features: CharacterFeatureEntry[] = []): Character =>
  characterSchema.parse({ name: 'Prüfling', features });

const answered = (sourceKey: string, choiceId: string, choice: string, gainedAt: number, choiceDe = ''): Change => ({
  target: 'featureChoice', sourceKey, choiceId, choice, choiceDe, gainedAt,
  step: 'assemble-decisions', source: sourceKey, label: `${choiceId}: ${choice}`,
});

/** Kurzform: nur, was den Eintrag identifiziert. */
const ledger = (c: Character) =>
  c.features.map((e) => ({ key: e.sourceKey, id: e.choiceId, wahl: e.choice, stufe: e.gainedAt }));

const apply = (c: Character, ...changes: Change[]): Character => {
  applyChanges(c, changes, { classIndex: 0 });
  return c;
};

describe('featureChoice-Upsert', () => {
  it('legt für jede Frage derselben Vergabe einen eigenen Eintrag an', () => {
    const c = apply(
      character(),
      answered(FEAT, LIST_ID, 'wizard', 4),
      answered(FEAT, ABILITY_ID, 'Intelligence', 4),
    );

    expect(ledger(c)).toEqual([
      { key: FEAT, id: LIST_ID, wahl: 'wizard', stufe: 4 },
      { key: FEAT, id: ABILITY_ID, wahl: 'Intelligence', stufe: 4 },
    ]);
  });

  it('ersetzt dieselbe Frage derselben Vergabe — der zweite Durchlauf legt nichts daneben', () => {
    const c = apply(
      character(),
      answered(FEAT, LIST_ID, 'wizard', 4),
      answered(FEAT, LIST_ID, 'cleric', 4),
    );

    expect(ledger(c)).toEqual([{ key: FEAT, id: LIST_ID, wahl: 'cleric', stufe: 4 }]);
  });

  it('trennt zwei Vergaben desselben Merkmals (Expertise auf 1 und 6)', () => {
    const EXP = 'expertise_srd-2024_rogue_expertise';
    const c = apply(
      character(),
      answered('srd-2024_rogue_expertise', EXP, 'Stealth, Perception', 1),
      answered('srd-2024_rogue_expertise', EXP, 'Acrobatics, Insight', 6),
    );

    expect(ledger(c).map((e) => [e.stufe, e.wahl])).toEqual([
      [1, 'Stealth, Perception'],
      [6, 'Acrobatics, Insight'],
    ]);
  });

  it('lässt den Talent-Link derselben Vergabe stehen', () => {
    const link: CharacterFeatureEntry = {
      sourceKey: FEAT, name: 'Eingeweihter der Magie', choice: '', choiceDe: '', choiceId: '', gainedAt: 4, desc: '',
    };
    const c = apply(character([link]), answered(FEAT, LIST_ID, 'wizard', 4));

    expect(c.features[0]).toEqual(link);
    expect(ledger(c)[1]).toEqual({ key: FEAT, id: LIST_ID, wahl: 'wizard', stufe: 4 });
  });
});

describe('ungestempelter Altbestand', () => {
  const legacy = (choice: string): CharacterFeatureEntry => ({
    sourceKey: FEAT, name: '', choice, choiceDe: '', choiceId: '', gainedAt: 4, desc: '',
  });

  it('bekommt den Stempel, statt eine Dublette daneben zu erzeugen', () => {
    const c = apply(character([legacy('wizard')]), answered(FEAT, LIST_ID, 'cleric', 4));

    expect(ledger(c)).toEqual([{ key: FEAT, id: LIST_ID, wahl: 'cleric', stufe: 4 }]);
  });

  /**
   * Zwei ungestempelte Antworten derselben Vergabe sind nicht auseinanderzuhalten — hier
   * anzufassen hieße raten, und ein Fehlgriff überschriebe die andere Wahl. Der neue Eintrag
   * kommt daneben; die Merkmalsleiste zeigt den übrig gebliebenen als lose Antwort.
   */
  it('bleibt unangetastet, wenn er mehrdeutig ist', () => {
    const c = apply(character([legacy('wizard'), legacy('Intelligence')]), answered(FEAT, LIST_ID, 'cleric', 4));

    expect(ledger(c)).toEqual([
      { key: FEAT, id: '', wahl: 'wizard', stufe: 4 },
      { key: FEAT, id: '', wahl: 'Intelligence', stufe: 4 },
      { key: FEAT, id: LIST_ID, wahl: 'cleric', stufe: 4 },
    ]);
  });
});
