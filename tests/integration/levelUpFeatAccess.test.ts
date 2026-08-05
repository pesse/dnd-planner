/**
 * Deterministischer Test des deklarierten Zauber-Zugangs im STUFENAUFSTIEG — OHNE LLM.
 *
 * Gegenstück zu `spellAccess.test.ts` (Erstell-Wizard): dort legt der Hintergrund die Liste
 * fest, hier wählt der Spieler sie. Geprüft wird die ganze Kette bis zum Änderungs-Dokument,
 * denn erst sie beweist, dass die Wahlen am Charakter ankommen.
 *
 *   npm run test -- levelUpFeatAccess
 */
import { describe, expect, it } from 'vitest';
import { getClasses } from '../../src/lib/classLibrary';
import { getFeats } from '../../src/lib/featsLibrary';
import { getProgressionByKey } from '../../src/lib/services/classProgression';
import {
  spellAbilityChoiceId,
  spellAccessChoices,
  spellAccessGrantOf,
  spellListChoiceId,
  withoutSpellAccessFeatures,
} from '../../src/lib/services/spellAccess';
import { buildDoc } from '../../src/lib/services/levelUp/doc';
import { buildFeatureChoices } from '../../src/lib/services/levelUp/questions';
import { featToGainedFeature } from '../../src/lib/services/levelUp/features';
import { noDeclaredSpells } from '../../src/lib/services/levelUp/spells';
import type { Change } from '../../src/lib/schemas/levelUp';
import {
  CANTRIP_COUNT,
  CHOSEN_LIST,
  DECLARED_ABILITIES,
  DECLARED_LISTS,
  EXPECTED_CHOICE_COUNT,
  featAsGained,
  LEVEL1_COUNT,
  loadBaseFeatures,
  loadFighterDelta,
  loadMagicInitiate,
  MAGIC_INITIATE_KEY,
  TO_LEVEL,
} from '../fixtures/fighter-l4-magic-initiate';

const grantOfMagicInitiate = async () => {
  const feat = await loadMagicInitiate();
  const grant = spellAccessGrantOf({
    key: feat.sourceKey,
    name: feat.name,
    nameDe: feat.nameDe,
    grantsChoice: feat.grantsChoice,
    grantsCasting: feat.grantsCasting,
  });
  if (!grant) throw new Error('vault/feats/magic-initiate.json deklariert keinen spellAccess');
  return grant;
};

describe('deklarierter Zauber-Zugang im Aufstieg (Kämpfer 3→4 nimmt Eingeweihter der Magie)', () => {
  it('liest die Deklaration ohne Vorgabe des Hintergrunds vollständig aus', async () => {
    const grant = await grantOfMagicInitiate();
    expect(grant.featureKey).toBe(MAGIC_INITIATE_KEY);
    // Gegen den Vault, nicht gegen ein Literal: eine Umbenennung im Inhalt ist kein Testbruch.
    expect(grant.featureDe).toBe((await loadMagicInitiate()).nameDe);
    // Kein Hintergrund legt hier fest → alle drei Listen bleiben zulässig, es wird gefragt.
    expect(grant.lists).toEqual([...DECLARED_LISTS]);
    expect(grant.abilities).toEqual([...DECLARED_ABILITIES]);
    expect(grant.picks).toEqual([
      { level: 0, count: CANTRIP_COUNT, sourceId: MAGIC_INITIATE_KEY, quotaId: 'cantrips' },
      { level: 1, count: LEVEL1_COUNT, sourceId: MAGIC_INITIATE_KEY, quotaId: 'spell1' },
    ]);
  });

  it('fragt erst die Liste, dann die Zauber — mit dem deklarierten Kontingent', async () => {
    const grant = await grantOfMagicInitiate();

    // Solange die Liste offen ist, entsteht KEINE Zauber-Wahl: der Picker hätte keinen Filter.
    const open = spellAccessChoices(grant);
    expect(open.map((c) => c.type)).toEqual(['choice', 'choice']);
    expect(open[0].optionsDe).toEqual(['Kleriker', 'Druide', 'Magier']);

    const answered = spellAccessChoices(grant, CHOSEN_LIST);
    expect(answered).toHaveLength(EXPECTED_CHOICE_COUNT);
    const picks = answered.filter((c) => c.type === 'spell-pick');
    // Die `max`-Falle: zwei Zaubertricks als EINE Wahl mit max 2, nicht max 1.
    expect(picks.map((c) => [c.spellLevels, c.max, c.spellClass])).toEqual([
      [[0], CANTRIP_COUNT, CHOSEN_LIST],
      [[1], LEVEL1_COUNT, CHOSEN_LIST],
    ]);
    expect(picks.flatMap((c) => c.options)).toEqual([]);
  });

  it('hält das Talent aus dem KI-Eingang', async () => {
    const feat = await loadMagicInitiate();
    const grant = await grantOfMagicInitiate();
    const gained = [featAsGained(feat)];
    expect(gained.map((g) => g.key)).toEqual([MAGIC_INITIATE_KEY]);
    expect(withoutSpellAccessFeatures(gained, [grant])).toEqual([]);
    // Ohne Deklaration bliebe es drin — genau der Zustand vor dieser Umstellung.
    expect(withoutSpellAccessFeatures(gained, [])).toHaveLength(1);
  });

  /**
   * Der eigentliche Beweis: die Antworten des Checkpoints landen als Änderungen am Charakter.
   * Ohne diesen Schritt wäre die Wahl nur ein Protokolleintrag.
   */
  it('schreibt die gewählten Zauber und die Wahlen ins Änderungs-Dokument', async () => {
    const feat = await loadMagicInitiate();
    const grant = await grantOfMagicInitiate();
    const delta = await loadFighterDelta();
    const questions = buildFeatureChoices(spellAccessChoices(grant, CHOSEN_LIST));

    const cantrips = questions.find((q) => q.spellLevels.includes(0))!;
    const level1 = questions.find((q) => q.spellLevels.includes(1))!;
    // Antworten tragen `spell.key` — `spellOf` unten löst sie wieder in Name/Grad auf.
    const spells = {
      'srd-2024_fire-bolt': { name: 'Feuerpfeil', level: 0 },
      'srd-2024_light': { name: 'Licht', level: 0 },
      'srd-2024_magic-missile': { name: 'Magisches Geschoss', level: 1 },
    };
    const answers: Record<string, string | string[]> = {
      [spellListChoiceId(grant)]: CHOSEN_LIST,
      [spellAbilityChoiceId(grant)]: 'Intelligence',
      [cantrips.id]: ['srd-2024_fire-bolt', 'srd-2024_light'],
      [level1.id]: ['srd-2024_magic-missile'],
    };

    const doc = buildDoc({
      delta,
      hitDice: '3W10',
      chosenSubclass: null,
      subFeatures: [],
      declaredSpells: noDeclaredSpells(),
      charLevelSpells: noDeclaredSpells(),
      grantSources: [], choiceSources: [],
      validatedBase: { riders: [], flagged: [], grantedCantrips: [], grantedPrepared: [] },
      validatedFeats: { riders: [], flagged: [], grantedCantrips: [], grantedPrepared: [] },
      answers,
      konMod: 2,
      pickedCantrips: [],
      pickedLearned: [],
      spellOf: (key: string) => spells[key as keyof typeof spells],
      chosenFeats: [{ key: MAGIC_INITIATE_KEY, name: feat.nameDe ?? feat.name, gainedAt: TO_LEVEL }],
      baseChoiceQs: [],
      featChoiceQs: questions,
      gainedFeatures: [],
      hpPerLevelSources: [],
      narrativeSummary: '',
      featuresText: '',
    });

    const of = (target: Change['target']) => doc.changes.filter((c) => c.target === target);
    expect(of('cantrip').map((c) => (c as { name: string }).name)).toEqual(['Feuerpfeil', 'Licht']);
    expect(of('preparedSpell')).toEqual([
      expect.objectContaining({ level: 1, name: 'Magisches Geschoss', prepared: true, source: MAGIC_INITIATE_KEY }),
    ]);
    // Liste UND Attribut gehören ins Merkmals-Ledger (dauerhafte Aufbau-Entscheidungen);
    // die Zauber selbst nicht — die stehen im Zauber-Block.
    expect(of('featureChoice').map((c) => (c as { choice: string }).choice).sort()).toEqual(['Intelligence', 'wizard']);
    expect(of('featureChoice').every((c) => (c as { gainedAt: number }).gainedAt === TO_LEVEL)).toBe(true);
    // Das Talent selbst bleibt ein Referenz-Link.
    expect(of('feat')).toHaveLength(1);
  });

  it('bringt Kämpfer 3→4 keinen Merkmals-Eingang (der Fall isoliert den Talent-Pfad)', async () => {
    expect(await loadBaseFeatures()).toEqual([]);
  });

  /**
   * Deckung: fällt ein Talent mit deklariertem Zugang aus der Erkennung, holt die KI es sich
   * zurück — inklusive der `max`-Falle. Dieser Test ist die einzige Stelle, die das bemerkt.
   */
  it('deckt jedes Talent mit deklariertem Zauber-Zugang ab', async () => {
    const feats = await getFeats();
    expect(feats.length, 'Vault-Shim aktiv?').toBeGreaterThan(10);

    const declared = feats.filter((f) => f.grantsChoice?.kind === 'spellAccess');
    expect(declared.map((f) => f.sourceKey)).toEqual([MAGIC_INITIATE_KEY]);
    for (const f of declared) {
      const grant = spellAccessGrantOf({ key: f.sourceKey, name: f.name, nameDe: f.nameDe, grantsChoice: f.grantsChoice, grantsCasting: f.grantsCasting });
      expect(grant, `${f.sourceKey}: Deklaration lesbar`).not.toBeNull();
      // Ohne Kontingent gäbe es keine Zauber-Wahl — das Talent wäre stumm.
      expect(grant!.picks.length, `${f.sourceKey}: Kontingent deklariert`).toBeGreaterThan(0);
      expect(grant!.lists.length, `${f.sourceKey}: Zauberliste deklariert`).toBeGreaterThan(0);
      expect(grant!.abilities.length, `${f.sourceKey}: Zauberattribut deklariert`).toBeGreaterThan(0);
    }
  });

  /**
   * Klassenmerkmale können `spellAccess` ebenfalls deklarieren (dasselbe Feld), aber der
   * Aufstieg führt sie NICHT: `isFlowOwnedChoiceFeature` nimmt sie aus dem KI-Eingang, und
   * nur der Talent-Pfad fragt einen Zugang ab. Ein solches Merkmal fiele also stumm aus.
   * Solange der Vault keins hat, ist das kein Loch — dieser Test hält es zu.
   */
  it('kein Klassenmerkmal deklariert einen Zauber-Zugang (sonst muss der Pfad erweitert werden)', async () => {
    const classes = await getClasses();
    expect(classes.length, 'Vault-Shim aktiv?').toBeGreaterThan(20);
    const found: string[] = [];
    for (const c of classes) {
      if (!c.key) continue;
      const prog = await getProgressionByKey(c.key);
      for (const f of prog?.features ?? []) {
        if (f.grantsChoice?.kind === 'spellAccess') found.push(`${c.key} :: ${f.name}`);
      }
    }
    expect(found).toEqual([]);
  });
});
