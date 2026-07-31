/**
 * Die Größenkategorie landet im Bogenfeld — OHNE LLM, über den ECHTEN Vault.
 *
 * Sie stand vorher nirgends: `personal.sizeCat` blieb leer, weil niemand sie schrieb. Hier hängt
 * die Zusicherung, dass jede Spezies einen Wert liefert und die WAHL von Mensch und Tiefling
 * nicht still zu einer Vorgabe wird (Begründung in `docs/plan-zauberwirker-vereinfachung.md`).
 *
 *   npm run eval -- --eval speciesSize
 */
import { describe, expect, it } from 'vitest';
import { getSpeciesByKey, getSpeciesList } from '../src/lib/speciesLibrary';
import { isSheetValueTrait } from '../src/lib/services/sheetValueTraits';
import { withoutOwnedChoices } from '../src/lib/services/declaredChoice';
import {
  resolveSizeCat,
  sizeChoiceId,
  sizeChoiceOf,
  sizeOptionsOf,
  sizeTraitOf,
} from '../src/lib/services/speciesSize';
import { buildFeaturePrep } from '../src/lib/services/wizard/featurePrep';
import { buildWizardCharacter } from '../src/lib/services/wizard/assembleCharacter';
import type { CharacterWizard } from '../src/lib/services/wizard/characterWizard.svelte';
import { pointBuyStart } from '../src/lib/services/wizard/pointBuy';
import { GNOME_SORCERER_BASICS } from './fixtures/gnome-sorcerer-sage';
import { libraryKey } from './libraryKey';

/**
 * Die Spezies, deren Größe eine Wahl ist — alle anderen liegen fest. Der Wert ist die
 * Reihenfolge im Merkmalstext: die Fee nennt „Small" zuerst, Mensch und Tiefling „Medium".
 */
const CHOOSING_ORDER: Record<string, string[]> = {
  'srd-2024_human': ['Medium', 'Small'],
  'srd-2024_tiefling': ['Medium', 'Small'],
  'phb-2024_fairy': ['Small', 'Medium'],
};
const CHOOSING = Object.keys(CHOOSING_ORDER);
const SIZE_DE: Record<string, string> = { Medium: 'Mittelgroß', Small: 'Klein' };

const traitsOf = async (key: string) => (await getSpeciesByKey(key))?.traits ?? [];

/**
 * Ein Wizard-Zustand ohne Runen und ohne KI-Ergebnisse — `assembleCharacter` importiert den Typ
 * nur, die Klasse selbst wäre in `environment: 'node'` nicht ladbar (`.svelte.ts`).
 */
function wizardStub(over: Partial<CharacterWizard> = {}): CharacterWizard {
  const noJob = { result: null, status: 'skipped' };
  return {
    name: 'Prüfling',
    playerName: '',
    species: { sourceKey: 'srd-2024_gnome', name: 'Gnom' },
    klass: { sourceKey: 'srd-2024_sorcerer', name: 'Zauberer' },
    background: { sourceKey: 'srd-2024_sage', name: 'Weiser' },
    scores: pointBuyStart(),
    asi: {},
    chosenSkills: [],
    masteries: [],
    fightingStyles: [],
    pickedCantrips: [],
    pickedKnown: [],
    pickedPrepared: [],
    featureSpellPicks: {},
    resolvedChoices: [],
    declaredAnswers: [],
    // Wie am echten Wizard immer gesetzt; `buildWizardCharacter` liest es für die Bogen-Notiz
    // des Zauber-Zugangs.
    spellAccess: [],
    // Ebenso immer gesetzt: die deklarierten Merkmale (Urtümliche Ordnung) und die daraus
    // gebauten Rider, die `buildWizardCharacter` neben den KI-Ridern anwendet.
    declared: [],
    riders: [],
    featureChoices: [],
    spellPickChoices: [],
    effects: noJob,
    classText: noJob,
    speciesText: noJob,
    hpPerLevelBonus: () => 0,
    selectedEquipment: () => ({ items: [], goldPieces: 0 }),
    ...over,
  } as unknown as CharacterWizard;
}

describe('Größenkategorie der Spezies', () => {
  it('liefert für jede Spezies des Bestands einen deutschen Wert', async () => {
    const list = await getSpeciesList();
    expect(list.length, 'Vault-Shim aktiv?').toBeGreaterThan(8);

    const fixed: Record<string, string> = {};
    for (const info of list) {
      const key = libraryKey(info);
      const traits = await traitsOf(key);
      // Jede Spezies MUSS ein Größenmerkmal haben — fehlt es, bleibt der Bogen leer.
      expect(sizeTraitOf(traits), key).toBeDefined();
      const options = sizeOptionsOf(traits);
      expect(options.length, `${key}: erkannte Kategorien`).toBeGreaterThan(0);
      if (options.length === 1) fixed[key] = resolveSizeCat(traits);
      else expect(CHOOSING, `${key} wählt seine Größe`).toContain(key);
    }

    expect(fixed).toEqual({
      'srd-2024_dragonborn': 'Mittelgroß',
      'srd-2024_dwarf': 'Mittelgroß',
      'srd-2024_elf': 'Mittelgroß',
      'srd-2024_gnome': 'Klein',
      'srd-2024_goliath': 'Mittelgroß',
      'srd-2024_halfling': 'Klein',
      'srd-2024_orc': 'Mittelgroß',
    });
  });

  it('macht aus zwei genannten Kategorien eine Wahl, aus einer keine', async () => {
    for (const key of CHOOSING) {
      const spec = await getSpeciesByKey(key);
      const choice = sizeChoiceOf(spec);
      expect(choice, key).not.toBeNull();
      // Englisch als Wert, deutsch als Label — Textreihenfolge, nicht Tabellenreihenfolge.
      expect(choice!.options, key).toEqual(CHOOSING_ORDER[key]);
      expect(choice!.optionsDe, key).toEqual(CHOOSING_ORDER[key].map((o) => SIZE_DE[o]));
      expect(choice!.id, key).toBe(sizeChoiceId(key));
      // Der Wert steht in `personal.sizeCat`; ein Ledger-Eintrag wäre eine zweite Wahrheit.
      expect(choice!.isBuildDecision, key).toBe(false);
      expect(choice!.determinesFurtherEffects, key).toBe(false);
      // Und das Merkmal bleibt undeklariert, sonst verschwände die Wahl aus dem KI-Eingang.
      expect(sizeTraitOf(spec!.traits) && isSheetValueTrait(sizeTraitOf(spec!.traits)!), key).toBe(false);
    }
    expect(sizeChoiceOf(await getSpeciesByKey('srd-2024_gnome'))).toBeNull();
  });

  it('errät nichts: ohne Antwort bleibt das Feld leer', async () => {
    const human = await traitsOf('srd-2024_human');
    expect(resolveSizeCat(human)).toBe('');
    expect(resolveSizeCat(human, '   ')).toBe('');
    // Eine Antwort, die keine der Optionen ist, zählt nicht (veralteter Zustand, Tippfehler).
    expect(resolveSizeCat(human, 'Tiny')).toBe('');
    expect(resolveSizeCat(human, 'Small')).toBe('Klein');
    expect(resolveSizeCat(human, 'medium')).toBe('Mittelgroß');
    // Ohne Größenmerkmal wird nichts erfunden.
    expect(resolveSizeCat([{ name: 'Speed', desc: '30 feet' }])).toBe('');
    expect(sizeChoiceOf({ key: 'homebrew_x', traits: [{ name: 'Size', desc: 'winzig klein' }] })).toBeNull();
  });

  it('hängt die Wahl in die deklarierten Wahlen des echten Wizard-Eingangs', async () => {
    expect((await buildFeaturePrep(GNOME_SORCERER_BASICS)).sizeChoice).toBeNull();
    const human = await buildFeaturePrep({
      ...GNOME_SORCERER_BASICS,
      species: { sourceKey: 'srd-2024_human', name: 'Mensch' },
    });
    expect(human.sizeChoice?.id).toBe(sizeChoiceId('srd-2024_human'));
    expect(human.sizeChoice?.questionDe).toBe('Größenkategorie');
  });

  /**
   * Die Größe von Mensch/Tiefling bleibt im KI-Eingang (der Speziestext braucht sie), also kann
   * das Modell dieselbe Wahl stellen. Gefragt wird trotzdem nur einmal.
   */
  it('verdrängt eine KI-Wahl zum selben Merkmal', async () => {
    const spec = await getSpeciesByKey('srd-2024_human');
    const declared = sizeChoiceOf(spec)!;
    const fromAi = [
      { ...declared, id: 'choice_size_1', isBuildDecision: true },
      { ...declared, id: 'choice_skillful_1', featureKey: 'srd-2024_human_skillful' },
    ];
    const kept = withoutOwnedChoices([declared], fromAi);
    expect(kept.map((c) => c.id)).toEqual(['choice_skillful_1']);
    // Ohne deklarierte Wahl bleibt jede KI-Wahl stehen.
    expect(withoutOwnedChoices([], fromAi)).toHaveLength(2);
  });

  it('schreibt den Wert beim Zusammenbau in personal.sizeCat', async () => {
    const gnome = await buildWizardCharacter(wizardStub());
    expect(gnome.personal.sizeCat).toBe('Klein');
    // Die Bewegungsrate ist die Nachbarzeile — sie darf sich dabei nicht verschieben.
    // Reine Meterzahl seit `metersFromSpeedText`: der Bogen hängt das „m" selbst an.
    expect(gnome.speed).toBe('9');

    const humanSpecies = { sourceKey: 'srd-2024_human', name: 'Mensch' };
    const answered = await buildWizardCharacter(
      wizardStub({
        species: humanSpecies,
        declaredAnswers: [{ id: sizeChoiceId('srd-2024_human'), choice: 'Small' }],
      }),
    );
    expect(answered.personal.sizeCat).toBe('Klein');

    // Unbeantwortet bleibt leer statt geraten — die Oberfläche erzwingt die Antwort
    // (`declaredChoicesDone`), und ein Standardwert wäre eine erfundene Regelentscheidung.
    const unanswered = await buildWizardCharacter(wizardStub({ species: humanSpecies }));
    expect(unanswered.personal.sizeCat).toBe('');
  });
});
