/**
 * Rettungswurf-Übung als Ersatz-Wahl (`grantsChoice.kind === 'savingThrowProficiency'`) am
 * Düsterpirscher-Merkmal „Stählerner Verstand" — über den ECHTEN Vault.
 *
 *   npm run test -- savingThrowChoice
 */
import { describe, expect, it } from 'vitest';
import { getProgressionByKey } from '../../src/lib/services/classProgression';
import { declaredFeatures } from '../../src/lib/services/declaredFeature';
import { declaredGrantRiders } from '../../src/lib/services/declaration/grants';
import { riderGrantChanges } from '../../src/lib/services/levelUp/changes';
import {
  savingThrowProficiencyChoices, savingThrowProficiencyRiders, sheetSaveProficiencies,
} from '../../src/lib/services/declaration/savingThrowProficiency';

const IRON_MIND_ID = 'saveprof_phb-2024-ranger-gloom-stalker-iron-mind';

const ironMind = async () => {
  const prog = await getProgressionByKey('phb-2024_gloom-stalker');
  const f = prog?.features.find((x) => x.key === 'phb-2024_ranger_gloom-stalker_iron-mind');
  expect(f, 'Stählerner Verstand im Vault').toBeTruthy();
  return declaredFeatures('subclass', [f!]);
};

describe('Stählerner Verstand', () => {
  it('fragt nichts, solange WEI-Rettungswürfe noch nicht geübt sind', async () => {
    expect(savingThrowProficiencyChoices(await ironMind(), ['Strength', 'Dexterity'])).toEqual([]);
  });

  it('stellt INT oder CHA zur Wahl, wenn WEI schon geübt ist', async () => {
    const [choice] = savingThrowProficiencyChoices(await ironMind(), ['Wisdom', 'Charisma']);
    expect(choice.id).toBe(IRON_MIND_ID);
    // Charisma ist schon geübt (Kleriker-Multiklasse) und fällt heraus.
    expect(choice.options).toEqual(['Intelligence']);
    expect(choice.max).toBe(1);
  });

  it('gewährt die gewählte Übung neben dem festen WEI-Grant', async () => {
    const features = await ironMind();
    const riders = [
      ...declaredGrantRiders(features),
      ...savingThrowProficiencyRiders(features, (id) => (id === IRON_MIND_ID ? 'Charisma' : '')),
    ];
    const values = riderGrantChanges(riders, { step: 'feature-effects', source: 'class-feature' })
      .filter((c) => c.target === 'savingThrow')
      .map((c) => ('value' in c ? c.value : ''));
    expect(values.sort()).toEqual(['Charisma', 'Wisdom']);
  });

  it('liest den Übungsstand des Bogens als SRD-Namen', () => {
    const saves = sheetSaveProficiencies({ str: false, dex: true, con: false, int: false, wis: true, cha: false });
    expect(saves).toEqual(['Dexterity', 'Wisdom']);
  });
});
