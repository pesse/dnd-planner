/**
 * Werkzeug-Übung und Attributserhöhung eines Merkmals — OHNE LLM, über den ECHTEN Vault.
 *
 * Die zwei Eigenheiten, die sonst wieder auseinanderlaufen: die Werkzeugwahl hat wie die
 * Sprachwahl KEIN Vokabular (deutscher Freitext statt Optionsliste), und die
 * Attributserhöhung ist das einzige ADDITIVE Ziel — ihre Obergrenze reist deshalb je Merkmal
 * mit, weil ein Epischer Segen auf 30 deckelt, wo jedes andere Merkmal auf 20 deckelt.
 *
 *   npm run test -- abilityAndToolGrants
 */
import { describe, expect, it } from 'vitest';
import { getFeats } from '../../src/lib/featsLibrary';
import { getClasses } from '../../src/lib/classLibrary';
import { libraryKey } from '../support/libraryKey';
import { getProgressionByKey } from '../../src/lib/services/classProgression';
import { characterSchema } from '../../src/lib/schemas/characterSchema';
import { featSchema } from '../../src/lib/schemas/feat';
import { applyChanges } from '../../src/lib/services/applyChanges';
import { buildFeatureChoices } from '../../src/lib/services/levelUp/questions';
import { declaredFeatures as tagged, type DeclaredFeature } from '../../src/lib/services/declaredFeature';
import { declaredGrantRiders } from '../../src/lib/services/declaration/grants';
import { riderChanges } from '../../src/lib/services/levelUp/changes';
import {
  isToolProficiencyFeature, toolProficiencyChoices, toolProficiencyRiders,
} from '../../src/lib/services/declaration/toolProficiency';
import {
  abilityIncreaseChoiceId, abilityIncreaseChoices, abilityIncreaseRefs, abilityIncreaseRiders,
  isAbilityIncreaseFeature,
} from '../../src/lib/services/declaration/abilityIncrease';
import type { Change, FeatureRider } from '../../src/lib/schemas/levelUp';
import type { DeclaredChoiceSource } from '../../src/lib/services/declaration/source';

const feat = async (sourceKey: string): Promise<DeclaredFeature> => {
  const f = (await getFeats()).find((x) => x.sourceKey === sourceKey);
  expect(f, `${sourceKey} im Vault — Shim aktiv?`).toBeTruthy();
  return tagged('feat', [f!])[0];
};

const declaringFeats = async (is: (f: DeclaredChoiceSource) => boolean): Promise<string[]> =>
  (await getFeats()).filter(is).map((f) => f.sourceKey ?? '').sort();

/** Die Änderungen eines Riders — derselbe Weg, den der Aufstieg geht. */
const changesOf = (riders: FeatureRider[]): Change[] =>
  riderChanges({ riders, flagged: [], grantedCantrips: [], grantedPrepared: [] }, 'feature-effects');

describe('deklarierte Werkzeug-Wahl', () => {
  const CRAFTER_ID = 'tools_crafter';

  it('deklariert die Werkzeugwahl im ganzen Vault nur, wo die Regel sie kennt', async () => {
    expect(await declaringFeats(isToolProficiencyFeature)).toEqual(['phb-2024_crafter', 'phb-2024_musician']);
  });

  it('fragt als Freitext, nicht als Optionsliste', async () => {
    const [choice, ...rest] = toolProficiencyChoices([await feat('phb-2024_crafter')]);
    expect(rest).toEqual([]);
    expect(choice.id).toBe(CRAFTER_ID);
    expect(choice.type).toBe('text');
    expect(choice.max).toBe(3);
    expect(choice.options, 'ohne Vokabular gibt es nichts anzubieten').toEqual([]);
    expect(choice.questionDe).toContain('Handwerker');
    // Der Fragebogen macht daraus ein Eingabefeld — als `choice` bliebe die Frage tot.
    expect(buildFeatureChoices([choice])[0].type).toBe('text');
  });

  it('schreibt die getippten Werkzeuge deutsch auf den Bogen', async () => {
    const crafter = await feat('phb-2024_crafter');
    const riders = toolProficiencyRiders([crafter], (id) => (id === CRAFTER_ID ? 'Schmiedewerkzeug, Laute' : ''));
    expect(riders).toHaveLength(1);
    expect(riders[0].proficiencies.tools).toEqual(['Schmiedewerkzeug', 'Laute']);

    const c = characterSchema.parse({ name: 'Prüfling Werkzeug' });
    applyChanges(c, changesOf(riders), { classIndex: 0 });
    // Deutsch bis auf den Bogen: es gibt keine Liste, aus der eine englische Kanonform käme.
    expect(c.tools).toEqual(['Schmiedewerkzeug', 'Laute']);
    expect(toolProficiencyRiders([crafter], () => '')).toEqual([]);
  });

  it('trägt die FESTE Werkzeugübung eines Merkmals über dieselbe Senke', async () => {
    const prog = await getProgressionByKey('phb-2024_assassin');
    const tools = prog?.features.find((f) => f.key === 'phb-2024_rogue_assassin_assassins-tools');
    expect(tools, 'Werkzeuge des Assassinen im Vault').toBeTruthy();

    const c = characterSchema.parse({ name: 'Prüfling Assassine' });
    // Werkzeuge reisen über den Rider, nicht als `declaredGrantChanges` — dort sind sie
    // ausgeschlossen, weil sonst jede Übung zweimal ankäme.
    applyChanges(c, changesOf(declaredGrantRiders(tagged('subclass', [tools!]))), { classIndex: 0 });
    expect(c.tools).toEqual(['Verkleidungsausrüstung', 'Giftmischerausrüstung']);
  });
});

describe('deklarierte Attributserhöhung', () => {
  const GRAPPLER_ID = 'ability_grappler';
  const abilityChangesOf = (changes: Change[]) =>
    changes.filter((c) => c.target === 'ability').map((c) => ({ ability: c.ability, value: c.value, max: c.max }));

  it('deklariert im ganzen Vault genau die Talente, deren Prosa ein Attribut erhöht', async () => {
    expect(await declaringFeats(isAbilityIncreaseFeature)).toEqual([
      'srd-2024_ability-score-improvement',
      'srd-2024_boon-of-combat-prowess',
      'srd-2024_boon-of-dimensional-travel',
      'srd-2024_boon-of-fate',
      'srd-2024_boon-of-irresistible-offense',
      'srd-2024_boon-of-spell-recall',
      'srd-2024_boon-of-the-night-spirit',
      'srd-2024_boon-of-truesight',
      'srd-2024_grappler',
    ]);
    // Kein Klassenmerkmal deklariert eine: die Erhöhung der Stufentabelle fragt der Aufstieg.
    for (const info of await getClasses()) {
      const prog = await getProgressionByKey(libraryKey(info));
      for (const f of prog?.features ?? []) expect(isAbilityIncreaseFeature(f), f.key).toBe(false);
    }
  });

  it('grenzt die Wahl auf die Attribute des Regeltexts ein', async () => {
    const [choice, ...rest] = abilityIncreaseChoices([await feat('srd-2024_grappler')]);
    expect(rest).toEqual([]);
    expect(choice.id).toBe(GRAPPLER_ID);
    expect(choice.type).toBe('choice');
    expect(choice.options).toEqual(['Strength', 'Dexterity']);
    expect(choice.optionsDe).toEqual(['Stärke', 'Geschicklichkeit']);
    // Additiv ist die Ausnahme unter den Zielen — die Frage sagt es an, sonst zählt ein
    // zweites „Übernehmen" am Charakter still ein zweites Mal.
    expect(choice.helpDe).toBe('Additiv auf den Bogenwert, höchstens 20.');
  });

  it('stellt ohne Eingrenzung alle sechs zur Wahl — und nennt die Grenze des Segens', async () => {
    const [choice] = abilityIncreaseChoices([await feat('srd-2024_boon-of-truesight')]);
    expect(choice.options).toHaveLength(6);
    expect(choice.helpDe).toContain('30');
  });

  it('macht aus der Antwort eine gedeckelte Änderung', async () => {
    const grappler = await feat('srd-2024_grappler');
    const riders = abilityIncreaseRiders([grappler], (id) => (id === GRAPPLER_ID ? 'Strength' : ''));
    expect(abilityChangesOf(changesOf(riders))).toEqual([{ ability: 'str', value: 1, max: 20 }]);

    // Ein Attribut außerhalb der Deklaration gewährt nichts (statt irgendetwas).
    expect(abilityIncreaseRiders([grappler], () => 'Intelligence')).toEqual([]);
    expect(abilityIncreaseRiders([grappler], () => 'Stärke'), 'deutsch ist keine Antwort').toEqual([]);
    expect(abilityIncreaseRiders([grappler], () => '')).toEqual([]);
  });

  /** „+2 auf eines" und „+1 auf zwei" sind dieselbe Deklaration, zweimal gestellt. */
  it('stellt die Attributswerterhöhung als zwei Fragen', async () => {
    const asi = await feat('srd-2024_ability-score-improvement');
    const ids = abilityIncreaseRefs(asi).map(abilityIncreaseChoiceId);
    expect(ids).toEqual([
      'ability_ability-score-improvement',
      'ability_ability-score-improvement_2',
    ]);

    const both = abilityIncreaseRiders([asi], () => 'Strength');
    expect(abilityChangesOf(changesOf(both)), 'zweimal dasselbe Attribut ergibt +2').toEqual([
      { ability: 'str', value: 1, max: 20 },
      { ability: 'str', value: 1, max: 20 },
    ]);

    const c = characterSchema.parse({ name: 'Prüfling Erhöhung', abilities: { str: 14, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } });
    applyChanges(c, changesOf(both), { classIndex: 0 });
    expect(c.abilities.str).toBe(16);
    expect(c.mods.str).toBe(3);
  });

  it('deckelt je Merkmal, nicht je Charakter', async () => {
    const [grappler, boon] = await Promise.all([feat('srd-2024_grappler'), feat('srd-2024_boon-of-truesight')]);
    const riders = [
      ...abilityIncreaseRiders([grappler], () => 'Strength'),
      ...abilityIncreaseRiders([boon], () => 'Strength'),
    ];
    const c = characterSchema.parse({ name: 'Prüfling Segen', abilities: { str: 20, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } });
    applyChanges(c, changesOf(riders), { classIndex: 0 });
    // Der Ringer deckelt auf 20 und läuft leer, der Segen hebt auf 21.
    expect(c.abilities.str).toBe(21);
  });

  it('senkt einen bereits höheren Bestand nicht', async () => {
    const grappler = await feat('srd-2024_grappler');
    const c = characterSchema.parse({ name: 'Prüfling Hoch', abilities: { str: 22, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } });
    applyChanges(c, changesOf(abilityIncreaseRiders([grappler], () => 'Strength')), { classIndex: 0 });
    expect(c.abilities.str).toBe(22);
  });

  it('trägt die FESTE Erhöhung eines Merkmals mit ihrer eigenen Grenze', () => {
    const fixed = tagged('feat', [featSchema.parse({
      key: 'homebrew-sam_test-boon',
      name: 'Test Boon',
      grants: { abilities: [{ ability: 'Constitution', amount: 2, max: 30 }] },
    })]);
    expect(abilityChangesOf(changesOf(declaredGrantRiders(fixed))))
      .toEqual([{ ability: 'con', value: 2, max: 30 }]);

    const c = characterSchema.parse({ name: 'Prüfling Fest', abilities: { str: 10, dex: 10, con: 29, int: 10, wis: 10, cha: 10 } });
    applyChanges(c, changesOf(declaredGrantRiders(fixed)), { classIndex: 0 });
    expect(c.abilities.con).toBe(30);
  });
});
