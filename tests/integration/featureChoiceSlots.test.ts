/**
 * Die Wahl-Plätze der Merkmalsleiste gegen den ECHTEN Vault: welche Wahlen schuldet ein
 * Charakter, an WELCHEM Merkmal hängen sie, und welche Ledger-Antwort gehört zu welcher.
 *
 * Der Kern: Zauberliste und Zauberattribut sind Wahlen des MERKMALS („choose when you select
 * this feat"), also stehen sie in der Merkmalsleiste — nicht im Zauber-Block. Sie stehen unter
 * demselben `sourceKey` wie die Zweigwahl desselben Merkmals, deshalb prüft die Zuordnung den
 * WERT und nicht nur den Schlüssel.
 *
 *   npm run test -- featureChoiceSlots
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { characterSchema, type Character, type CharacterFeatureEntry } from '../../src/lib/schemas/characterSchema';
import { upgradeCharacter } from '../../src/lib/schemas/characterUpgrades';
import {
  buildCharacterChoices, collectChoiceSlots, type CharacterChoice, type ChoiceFact,
} from '../../src/lib/services/characterChoices';

const MAGIC_INITIATE_KEY = 'srd-2024_magic-initiate';
const ELF_LINEAGE_KEY = 'srd-2024_elf_elven-lineage';

const character = (dir: string): Character =>
  characterSchema.parse(
    upgradeCharacter(JSON.parse(readFileSync(`vault/characters/${dir}/character.json`, 'utf-8'))).data,
  );

type TestCharacter = Parameters<typeof collectChoiceSlots>[0] & { skills?: Character['skills'] };

async function choicesOf(c: TestCharacter): Promise<CharacterChoice[]> {
  const { slots } = await collectChoiceSlots(c);
  return buildCharacterChoices(slots, { proficient: [], ledger: c.features ?? [] });
}

const factsOf = async (c: TestCharacter): Promise<ChoiceFact[]> => (await collectChoiceSlots(c)).facts;

/** Kurzform: Merkmal + Frage + Antwort, damit die Erwartung als Ganzes lesbar bleibt. */
const shape = (list: CharacterChoice[]) =>
  list.map((ch) => ({
    key: ch.slot.feature.key,
    part: ch.slot.access?.part ?? '',
    frage: ch.choice.questionDe,
    antwort: ch.answer.join(', '),
    optionen: ch.choice.options.length,
  }));

const answer = (sourceKey: string, choice: string, gainedAt: number): CharacterFeatureEntry => ({
  sourceKey, name: '', choice, choiceDe: '', desc: '', gainedAt,
});

const link = (sourceKey: string, gainedAt: number): CharacterFeatureEntry => ({
  sourceKey, name: '', choice: '', choiceDe: '', desc: '', gainedAt,
});

describe('Zauber-Wahlen am Herkunftstalent (Bölgör aus dem Vault)', () => {
  /**
   * Der Live-Befund: das Auswahlfeld gehört ans Herkunftsmerkmal. Die LISTE fragt niemand —
   * „Weiser" legt sie fest —, das ATTRIBUT hängt am Talent und ist beantwortet.
   */
  it('stellt genau die Attributwahl, und zwar am Talent-Key', async () => {
    const c = character('bölgör');
    const rows = shape(await choicesOf(c)).filter((r) => r.key === MAGIC_INITIATE_KEY);

    expect(rows).toEqual([
      { key: MAGIC_INITIATE_KEY, part: 'ability', frage: 'Zauberattribut', antwort: 'Charisma', optionen: 3 },
    ]);
  });

  /**
   * Was der Hintergrund entscheidet, muss AM MERKMAL stehen: ohne diese Zeile gälte die
   * Magier-Liste unsichtbar, und der Zauber-Picker filterte scheinbar grundlos.
   */
  it('nennt die vom Hintergrund festgelegte Liste als Feststellung', async () => {
    const facts = (await factsOf(character('bölgör'))).filter((f) => f.featureKey === MAGIC_INITIATE_KEY);

    expect(facts).toEqual([
      { part: 'list', labelDe: 'Zauberliste', valueDe: 'Magier', fromSource: true, featureKey: MAGIC_INITIATE_KEY, gainedAt: 1 },
    ]);
  });

  /**
   * Die undeklarierte Wahl des Volksmerkmals („Blue", von der KI gedeutet) hat keinen Platz und
   * darf auch keinen fremden besetzen: der Attribut-Platz beansprucht nur seine eigenen Werte.
   */
  it('greift die Antwort eines anderen Merkmals nicht ab', async () => {
    const c = character('bölgör');
    const list = await choicesOf(c);
    const claimed = list.map((ch) => c.features[ch.entry]?.choice);

    expect(claimed).toEqual(['Charisma']);
    expect(c.features.some((e) => e.choice === 'Blue')).toBe(true);
  });
});

describe('Zwei Wahlen an EINEM Merkmal', () => {
  /**
   * Die Elfenabstammung stellt beide: ihre Zweigwahl (`grantsChoice`) und ihr Zauberattribut
   * (`grantsCasting`). Beide Antworten stehen unter demselben Key und derselben Stufe — ohne
   * die Wertprüfung griffe die Zweigwahl das „Intelligence" des Attributs.
   */
  it('trennt Zweigwahl und Zauberattribut der Elfenabstammung über den Wert', async () => {
    const rows = shape(
      await choicesOf({
        classes: [{ sourceKey: 'srd-2024_fighter', name: '', level: 5 }],
        species: { sourceKey: 'srd-2024_elf', name: '' },
        features: [answer(ELF_LINEAGE_KEY, 'Intelligence', 1), answer(ELF_LINEAGE_KEY, 'High Elf', 1)],
      }),
    );

    expect(rows).toEqual([
      { key: ELF_LINEAGE_KEY, part: '', frage: 'Elfenabstammung: Wähle eine Option', antwort: 'High Elf', optionen: 3 },
      { key: ELF_LINEAGE_KEY, part: 'ability', frage: 'Zauberattribut', antwort: 'Intelligence', optionen: 3 },
    ]);
  });
});

describe('Zweimal genommenes Talent', () => {
  /**
   * „A different list each time": jede Instanz schuldet ihre eigene Liste und ihr eigenes
   * Attribut, und jede Antwort gehört der Instanz, an deren Vergabe-Stufe sie steht.
   */
  it('gibt jeder Instanz ihre eigenen zwei Plätze und ihre eigene Antwort', async () => {
    const rows = shape(
      await choicesOf({
        classes: [{ sourceKey: 'srd-2024_fighter', name: '', level: 8 }],
        features: [
          link(MAGIC_INITIATE_KEY, 1),
          link(MAGIC_INITIATE_KEY, 4),
          answer(MAGIC_INITIATE_KEY, 'wizard', 1),
          answer(MAGIC_INITIATE_KEY, 'Intelligence', 1),
          answer(MAGIC_INITIATE_KEY, 'cleric', 4),
        ],
      }),
    );

    expect(rows.map((r) => [r.part, r.antwort])).toEqual([
      ['list', 'wizard'],
      ['ability', 'Intelligence'],
      ['list', 'cleric'],
      // Die zweite Instanz hat ihr Attribut noch nicht beantwortet — und erbt NICHT das der ersten.
      ['ability', ''],
    ]);
  });
});
