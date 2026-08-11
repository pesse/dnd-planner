/**
 * Der TEXTPARSER für die Größenkategorie — OHNE LLM, über den ECHTEN Vault. Er ist nur noch
 * FALLBACK für Homebrew und frische Open5e-Importe; ein redigiertes Merkmal führt seine Größe
 * über `grants.properties` (`characterProperties.test.ts`), dann schweigt der Parser.
 *
 * Geprüft wird: er KANN jede Spezies des Bestands lesen, er errät nichts, und er fällt einer
 * vorhandenen Deklaration nicht ins Wort.
 *
 *   npm run test -- speciesSize
 */
import { describe, expect, it } from 'vitest';
import { getSpeciesByKey, getSpeciesList } from '../../src/lib/speciesLibrary';
import { isSheetValueTrait } from '../../src/lib/services/sheetValueTraits';
import {
  resolveSizeCat,
  sizeChoiceId,
  sizeChoiceOf,
  sizeOptionsOf,
  sizeTraitOf,
} from '../../src/lib/services/speciesSize';
import { characterPropertyChoice, characterPropertyRefs, propertyChoiceId } from '../../src/lib/services/characterProperties';
import { declaredFeatures as tagged } from '../../src/lib/services/declaredFeature';
import { buildFeaturePrep } from '../../src/lib/services/wizard/featurePrep';
import { buildWizardCharacter } from '../../src/lib/services/wizard/assembleCharacter';
import type { CharacterWizard } from '../../src/lib/services/wizard/characterWizard.svelte';
import { pointBuyStart } from '../../src/lib/services/wizard/pointBuy';
import { emptySpellcasting } from '../../src/lib/services/spellcasting/write';
import { GNOME_SORCERER_BASICS } from '../fixtures/gnome-sorcerer-sage';
import { libraryKey } from '../support/libraryKey';

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
 * Stub statt echter Klasse: `.svelte.ts` ist in `environment: 'node'` nicht ladbar,
 * `assembleCharacter` importiert ohnehin nur den Typ.
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
    optionPicks: [],
    spellcasting: emptySpellcasting(),
    featureSpellPicks: {},
    declaredAnswers: [],
    // Am echten Wizard immer gesetzt — `buildWizardCharacter` liest alle drei (Bogen-Notiz
    // des Zauber-Zugangs, deklarierte Merkmale, deren Rider).
    spellAccess: [],
    declared: [],
    riders: [],
    declaredChoices: [],
    spellPickChoices: [],
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

  it('macht aus zwei genannten Kategorien eine Wahl, aus einer keine', () => {
    // Synthetisch, weil im Bestand keine Spezies mehr undeklariert ist: das ist genau der
    // Homebrew-Fall, für den es den Parser noch gibt.
    for (const key of CHOOSING) {
      const desc = key === 'phb-2024_fairy'
        ? 'Small (about 2–4 feet tall) or Medium (about 4–6 feet tall)'
        : 'Medium (about 4–7 feet tall) or Small (about 2–4 feet tall)';
      const spec = { key, traits: [{ key: `${key}_size`, name: 'Size', nameDe: 'Größe', desc }] };
      const choice = sizeChoiceOf(spec);
      expect(choice, key).not.toBeNull();
      // Englisch als Wert, deutsch als Label — Textreihenfolge, nicht Tabellenreihenfolge.
      expect(choice!.options, key).toEqual(CHOOSING_ORDER[key]);
      expect(choice!.optionsDe, key).toEqual(CHOOSING_ORDER[key].map((o) => SIZE_DE[o]));
      expect(choice!.id, key).toBe(sizeChoiceId(key));
      // Der Wert steht in `personal.sizeCat`; ein Ledger-Eintrag wäre eine zweite Wahrheit.
      // (Der deklarierte Pfad entscheidet das anders — dort ist die Antwort auffindbar.)
      expect(choice!.isBuildDecision, key).toBe(false);
    }
    expect(sizeChoiceOf({ key: 'homebrew_x', traits: [{ name: 'Size', desc: 'Medium' }] })).toBeNull();
  });

  /**
   * Die Reihenfolge-Regel des ganzen Fallbacks: wo eine Deklaration steht, fragt der Parser
   * nicht mehr. Ohne diesen Riegel stünde die Größenfrage im Wizard zweimal.
   */
  it('schweigt, wo das Merkmal redigiert ist', async () => {
    for (const key of CHOOSING) {
      const spec = await getSpeciesByKey(key);
      const trait = sizeTraitOf(spec!.traits)!;
      expect(trait.grantsChoice?.map((g) => g.kind), key).toEqual(['characterProperty']);
      expect(sizeChoiceOf(spec), key).toBeNull();
      // Die drei tragen weiterhin KEINEN Bogenwert-Diskriminator: die Wahl nimmt sie über
      // `withoutDeclaredChoiceFeatures` aus dem KI-Eingang, nicht `sheetValue`.
      expect(isSheetValueTrait(trait), key).toBe(false);
    }
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

  it('liefert dem echten Wizard-Eingang nichts mehr, solange der Bestand redigiert ist', async () => {
    expect((await buildFeaturePrep(GNOME_SORCERER_BASICS)).sizeChoice).toBeNull();
    const human = await buildFeaturePrep({
      ...GNOME_SORCERER_BASICS,
      species: { sourceKey: 'srd-2024_human', name: 'Mensch' },
    });
    // Die Frage stellt jetzt der Eigenschafts-Pfad (`declaredChoices`) — hier nur die
    // Zusicherung, dass sie nicht ZUSÄTZLICH aus dem Parser kommt.
    expect(human.sizeChoice).toBeNull();
  });

  it('schreibt den Wert beim Zusammenbau in personal.sizeCat', async () => {
    const gnome = await buildWizardCharacter(wizardStub());
    expect(gnome.personal.sizeCat).toBe('Klein');
    // Die Bewegungsrate ist die Nachbarzeile — sie darf sich dabei nicht verschieben.
    // Reine Meterzahl seit `metersFromSpeedText`: der Bogen hängt das „m" selbst an.
    expect(gnome.speed).toBe('9');

    const humanSpecies = { sourceKey: 'srd-2024_human', name: 'Mensch' };
    const human = await getSpeciesByKey('srd-2024_human');
    const declared = tagged('species', [sizeTraitOf(human!.traits)!]);
    const answered = await buildWizardCharacter(
      wizardStub({
        species: humanSpecies,
        declared,
        declaredAnswers: [{ id: propertyChoiceId(characterPropertyRefs(declared[0])[0]), choice: 'Small' }],
      }),
    );
    expect(answered.personal.sizeCat).toBe('Klein');

    // Unbeantwortet bleibt leer statt geraten — die Oberfläche erzwingt die Antwort
    // (`declaredChoicesDone`), und ein Standardwert wäre eine erfundene Regelentscheidung.
    const unanswered = await buildWizardCharacter(wizardStub({ species: humanSpecies, declared }));
    expect(unanswered.personal.sizeCat).toBe('');
  });
});
