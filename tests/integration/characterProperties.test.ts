/**
 * Deklarierte Grundeigenschaften (`grants.properties`, `grantsChoice.kind ===
 * 'characterProperty'`) — OHNE LLM, über den ECHTEN Vault.
 *
 * Die Zusicherungen, die vorher an einem Textparser hingen: jede Spezies des Bestands SAGT
 * ihre Größe und ihre Bewegungsrate, statt sie erraten zu lassen; die drei Spezies mit Wahl
 * bieten genau ihre zwei Kategorien an; und die Antwort landet über dieselbe Senke am
 * Charakter wie jeder andere Grant (`Change` → `applyChanges`), inklusive der
 * Übersetzungsgrenze englisch/deutsch und Fuß/Meter.
 *
 *   npm run test -- characterProperties
 */
import { describe, expect, it } from 'vitest';
import { getSpeciesByKey, getSpeciesList } from '../../src/lib/speciesLibrary';
import { libraryKey } from '../support/libraryKey';
import { characterSchema } from '../../src/lib/schemas/characterSchema';
import { applyChanges } from '../../src/lib/services/applyChanges';
import { declaredFeatures as tagged } from '../../src/lib/services/declaredFeature';
import { declaredGrantChanges } from '../../src/lib/services/declaration/grants';
import { sizeTraitOf } from '../../src/lib/services/speciesSize';
import {
  characterPropertyAnswerChanges,
  characterPropertyChanges,
  characterPropertyChoice,
  characterPropertyChoices,
  characterPropertyRefs,
  characterPropertyOptions,
  characterPropertyPickers,
  isCharacterPropertyFeature,
  propertyChoiceId,
} from '../../src/lib/services/characterProperties';
import { withoutDeclaredChoiceFeatures } from '../../src/lib/services/declaration/optionList';
import { buildFeaturePrep } from '../../src/lib/services/wizard/featurePrep';
import { GNOME_SORCERER_BASICS } from '../fixtures/gnome-sorcerer-sage';
import type { Trait } from '../../src/lib/schemas/species';

/** Die Spezies, deren Größe eine Wahl ist — Wert = Reihenfolge im Regeltext. */
const CHOOSING: Record<string, string[]> = {
  'srd-2024_human': ['Medium', 'Small'],
  'srd-2024_tiefling': ['Medium', 'Small'],
  'phb-2024_fairy': ['Small', 'Medium'],
};

const META = { step: 'test', source: 'test' };
const speedTraitOf = (traits: Trait[]) => traits.find((t) => /(_speed$|^speed$)/i.test(t.key ?? ''));

describe('der Bestand deklariert seine Grundeigenschaften', () => {
  it('gibt jeder Spezies eine Größe — fest oder als Wahl — und eine Bewegungsrate', async () => {
    const list = await getSpeciesList();
    expect(list.length, 'Vault-Shim aktiv?').toBeGreaterThan(8);

    for (const info of list) {
      const key = libraryKey(info);
      const spec = await getSpeciesByKey(key);
      const size = sizeTraitOf(spec!.traits)!;
      const speed = speedTraitOf(spec!.traits);

      if (key in CHOOSING) {
        expect(size.grants?.properties.size, `${key}: Wahl statt Festwert`).toBeUndefined();
        expect(characterPropertyRefs(size).map((r) => characterPropertyOptions(r.grant)), key).toEqual([CHOOSING[key]]);
      } else {
        expect(size.grants?.properties.size, `${key}: feste Größe deklariert`).toBeDefined();
        expect(size.grantsChoice, `${key}: kein Wahl-Merkmal`).toBeUndefined();
      }
      // Die Bewegungsrate ist im ganzen Bestand ein Festwert — in Fuß, wie der Regeltext.
      expect(speed?.grants?.properties.speedFeet, `${key}: Bewegungsrate deklariert`).toBeGreaterThan(0);
    }
  });

  it('setzt feste Eigenschaften über dieselbe Senke wie jeden anderen Grant', async () => {
    const goliath = await getSpeciesByKey('srd-2024_goliath');
    const c = characterSchema.parse({ name: 'Prüfling' });
    applyChanges(c, declaredGrantChanges(tagged('species', goliath!.traits), META), { classIndex: 0 });

    // Übersetzungsgrenze: Vault englisch/Fuß, Bogen deutsch/Meter (35 ft = 10,5 m).
    expect(c.personal.sizeCat).toBe('Mittelgroß');
    expect(c.speed).toBe('10,5');
  });
});

describe('die Wahl einer Grundeigenschaft', () => {
  it('baut Optionen und Labels aus dem Vokabular, nicht aus der Deklaration', async () => {
    const fairy = await getSpeciesByKey('phb-2024_fairy');
    const trait = tagged('species', [sizeTraitOf(fairy!.traits)!])[0];
    const ref = characterPropertyRefs(trait)[0];
    const choice = characterPropertyChoice(ref)!;

    expect(isCharacterPropertyFeature(trait)).toBe(true);
    expect(choice.options).toEqual(['Small', 'Medium']);
    expect(choice.optionsDe).toEqual(['Klein', 'Mittelgroß']);
    expect(choice.questionDe).toBe('Größenkategorie');
    expect(choice.id).toBe(propertyChoiceId(ref));
    expect(choice.featureKey).toBe('phb-2024_fairy_size');
    // Die Antwort gehört ins Ledger — sonst wäre sie im Charakter-Editor nicht auffindbar.
    expect(choice.isBuildDecision).toBe(true);
  });

  it('wendet die Antwort an und verwirft, was nicht zum Vokabular gehört', async () => {
    const fairy = await getSpeciesByKey('phb-2024_fairy');
    const declared = tagged('species', [sizeTraitOf(fairy!.traits)!]);
    const answer = (choice: string) =>
      characterPropertyAnswerChanges(declared, () => choice, META);

    const c = characterSchema.parse({ name: 'Prüfling' });
    applyChanges(c, answer('Small'), { classIndex: 0 });
    expect(c.personal.sizeCat).toBe('Klein');

    // „Tiny" steht im Vokabular, aber nicht in der Deklaration; „Winzig" gar nicht.
    expect(answer('Tiny')).toHaveLength(0);
    expect(answer('Klein')).toHaveLength(0);
    expect(answer('')).toHaveLength(0);
  });

  it('steht im echten Wizard-Eingang — genau einmal', async () => {
    const prep = await buildFeaturePrep({
      ...GNOME_SORCERER_BASICS,
      species: { sourceKey: 'phb-2024_fairy', name: 'Feenwesen' },
    });
    const choices = characterPropertyChoices(prep.declared);
    expect(choices.map((c) => c.featureKey)).toEqual(['phb-2024_fairy_size']);
    // Der Parser-Fallback schweigt daneben, sonst stünde die Größenfrage zweimal.
    expect(prep.sizeChoice).toBeNull();
    // Und derselbe Filter hält das Merkmal aus dem Notiz-Eingang: die Wahl führt der Flow,
    // die Notiz wäre die zweite Fassung derselben Frage.
    const forNotes = withoutDeclaredChoiceFeatures(prep.speciesFeatures);
    expect(forNotes.some((f) => f.key === 'phb-2024_fairy_size')).toBe(false);
    expect(forNotes.some((f) => f.key === 'phb-2024_fairy_flight')).toBe(true);
  });

  it('stellt keine Frage, wo nichts zu wählen ist', () => {
    const one = { key: 'homebrew_x', name: 'Size', grantsChoice: [{ kind: 'characterProperty' as const, property: 'size' as const, propertyValues: ['Medium'], options: [], count: 1, column: '', skills: [], spellLists: [], spellAbilities: [], spellPicks: [] }] };
    expect(characterPropertyChoice(characterPropertyRefs(one)[0])).toBeNull();
    // Eine Zahl hat kein Wahl-Vokabular: die Bewegungsrate wird deklariert, nie gefragt.
    expect(characterPropertyPickers().map((p) => p.property)).toEqual(['size']);
  });
});

describe('die Deklaration bleibt unterscheidbar von „geprüft, gewährt nichts"', () => {
  it('zählt eine reine Eigenschaft als Mechanik', async () => {
    const dwarf = await getSpeciesByKey('srd-2024_dwarf');
    const size = sizeTraitOf(dwarf!.traits)!;
    // Ohne diese Zusicherung überspringt `declaredGrantChanges` das Merkmal als leer und
    // der Wert verschwindet still — dieselbe Lücke wie früher bei `weaponsOther`.
    expect(declaredGrantChanges(tagged('species', [size]), META)).toHaveLength(1);
    expect(characterPropertyChanges(size.grants?.properties, META)).toHaveLength(1);
    expect(characterPropertyChanges({}, META)).toHaveLength(0);
    expect(characterPropertyChanges(undefined, META)).toHaveLength(0);
  });
});
