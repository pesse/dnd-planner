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
import { describe, expect, it } from 'vitest';
import { type Character, type CharacterFeatureEntry } from '../../src/lib/schemas/characterSchema';
import { vaultCharacter } from '../support/vaultCharacter';
import {
  buildCharacterChoices, choiceIdOf, collectChoiceSlots, type CharacterChoice, type ChoiceFact,
  type ChoiceSlot,
} from '../../src/lib/services/characterChoices';

const MAGIC_INITIATE_KEY = 'srd-2024_magic-initiate';
const ELF_LINEAGE_KEY = 'srd-2024_elf_elven-lineage';


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

/** Altbestand: ohne Stempel, zugeordnet über Wert und Vergabe-Stufe. */
const answer = (sourceKey: string, choice: string, gainedAt: number): CharacterFeatureEntry => ({
  sourceKey, name: '', choice, choiceDe: '', choiceId: '', desc: '', gainedAt,
});

/** Was jeder heutige Schreibweg hinterlässt: die Antwort nennt ihre Frage. */
const stamped = (sourceKey: string, choiceId: string, choice: string, gainedAt?: number): CharacterFeatureEntry => ({
  sourceKey, name: '', choice, choiceDe: '', choiceId, desc: '', ...(gainedAt === undefined ? {} : { gainedAt }),
});

const link = (sourceKey: string, gainedAt: number): CharacterFeatureEntry => ({
  sourceKey, name: '', choice: '', choiceDe: '', choiceId: '', desc: '', gainedAt,
});

describe('Zauber-Wahlen am Herkunftstalent (Bölgör aus dem Vault)', () => {
  /**
   * Der Live-Befund: das Auswahlfeld gehört ans Herkunftsmerkmal. Die LISTE fragt niemand —
   * „Weiser" legt sie fest —, das ATTRIBUT hängt am Talent und ist beantwortet.
   */
  it('stellt genau die Attributwahl, und zwar am Talent-Key', async () => {
    const c = vaultCharacter('Bölgör');
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
    const facts = (await factsOf(vaultCharacter('Bölgör'))).filter((f) => f.featureKey === MAGIC_INITIATE_KEY);

    expect(facts).toEqual([
      { part: 'list', labelDe: 'Zauberliste', valueDe: 'Magier', fromSource: true, featureKey: MAGIC_INITIATE_KEY, gainedAt: 1 },
    ]);
  });

  /**
   * Die undeklarierte Wahl des Volksmerkmals („Blue", von der KI gedeutet) hat keinen Platz und
   * darf auch keinen fremden besetzen: der Attribut-Platz beansprucht nur seine eigenen Werte.
   */
  it('greift die Antwort eines anderen Merkmals nicht ab', async () => {
    const c = vaultCharacter('Bölgör');
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

/**
 * Der Anker: eine Antwort hängt an ihrer FRAGE (`choiceId`), nicht an ihrer Position im
 * Ledger. Erst damit trennt der Anker zwei Wahlen desselben Merkmals auf derselben
 * Vergabe-Stufe — Vorbedingung dafür, dass ein Merkmal mehr als eine Wahl deklarieren darf.
 */
describe('Der Anker einer Antwort', () => {
  /**
   * Frage-id und Zuordnungs-id kommen aus derselben Verzweigung (`slotKind`). Liefen sie
   * auseinander, stempelte der Fragebogen eine id, die die Merkmalsleiste nie wiederfände —
   * die Antwort wäre gespeichert und trotzdem unsichtbar.
   */
  it('stempelt jede Antwort mit genau der id, die ihre Frage trägt', async () => {
    const c = {
      // Alle vier Wahl-Arten in einem Charakter: Expertise (Schurke), Zweigwahl (Druide),
      // Grundeigenschaft und Zauberattribut (Fee), Zauberliste (Herkunftstalent).
      classes: [
        { sourceKey: 'srd-2024_rogue', name: '', level: 6 },
        { sourceKey: 'srd-2024_druid', name: '', level: 1 },
      ],
      species: { sourceKey: 'phb-2024_fairy', name: '' },
      features: [link(MAGIC_INITIATE_KEY, 4)],
    };
    const list = await choicesOf(c);

    expect(list.length).toBeGreaterThan(4);
    expect(list.map((ch) => choiceIdOf(ch.slot))).toEqual(list.map((ch) => ch.choice.id));
  });

  const twiceTaken = {
    classes: [{ sourceKey: 'srd-2024_fighter', name: '', level: 8 }],
    features: [link(MAGIC_INITIATE_KEY, 1), link(MAGIC_INITIATE_KEY, 4)],
  };

  const listSlotsOf = async (): Promise<{ slots: ChoiceSlot[]; lists: ChoiceSlot[] }> => {
    const { slots } = await collectChoiceSlots(twiceTaken);
    return { slots, lists: slots.filter((s) => s.access?.part === 'list') };
  };

  /**
   * Die beiden Instanzen tragen dieselben zulässigen Werte, also kann der Wert sie nicht
   * trennen; ohne `gainedAt` bliebe nur die Reihenfolge im Ledger, und die erste Instanz
   * bekäme die Antwort der zweiten.
   */
  it('ordnet gestempelte Antworten über die Frage zu, nicht über die Position', async () => {
    const { slots, lists } = await listSlotsOf();
    const rows = buildCharacterChoices(slots, {
      proficient: [],
      ledger: [
        ...twiceTaken.features,
        stamped(MAGIC_INITIATE_KEY, choiceIdOf(lists[1]), 'cleric'),
        stamped(MAGIC_INITIATE_KEY, choiceIdOf(lists[0]), 'wizard'),
      ],
    });

    expect(rows.filter((ch) => ch.slot.access?.part === 'list').map((ch) => ch.answer.join(', ')))
      .toEqual(['wizard', 'cleric']);
  });

  /**
   * Bölgörs Volksmerkmal zeigt die andere Hälfte: eine von der KI gedeutete Antwort steht
   * ungestempelt am selben Key. Sie darf den Platz nicht besetzen, nur weil sie im Ledger
   * vorn steht.
   */
  const elf = {
    classes: [{ sourceKey: 'srd-2024_fighter', name: '', level: 5 }],
    species: { sourceKey: 'srd-2024_elf', name: '' },
  };

  const branchSlot = async (): Promise<{ slots: ChoiceSlot[]; branch: ChoiceSlot }> => {
    const { slots } = await collectChoiceSlots(elf);
    return { slots, branch: slots.find((s) => !s.access && s.feature.key === ELF_LINEAGE_KEY)! };
  };

  it('zieht die gestempelte Antwort der losen desselben Merkmals vor', async () => {
    const { slots, branch } = await branchSlot();
    const ledger = [
      answer(ELF_LINEAGE_KEY, 'Blue', 1),
      stamped(ELF_LINEAGE_KEY, choiceIdOf(branch), 'High Elf', 1),
    ];

    const rows = buildCharacterChoices(slots, { proficient: [], ledger });
    const chosen = rows.find((ch) => ch.slot === branch)!;

    expect(chosen.answer).toEqual(['High Elf']);
    // Die lose Antwort bleibt unbeansprucht — die Merkmalsleiste führt sie als solche.
    expect(rows.some((ch) => ch.answer.includes('Blue'))).toBe(false);
  });

  /**
   * Eine KI-gedeutete Antwort trägt die id ihrer Prompt-Frage (`choice_…`), nie die eines
   * Platzes. Bekommt das Merkmal später eine Deklaration, muss der neue Platz sie trotzdem
   * finden — ein Stempel schützt nur, solange seine Frage gestellt wird.
   */
  it('adoptiert eine Antwort, deren Stempel zu keiner gestellten Frage gehört', async () => {
    const { slots, branch } = await branchSlot();
    const ledger = [stamped(ELF_LINEAGE_KEY, 'choice_elven-lineage_1', 'High Elf', 1)];

    const rows = buildCharacterChoices(slots, { proficient: [], ledger });

    expect(rows.find((ch) => ch.slot === branch)!.answer).toEqual(['High Elf']);
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
