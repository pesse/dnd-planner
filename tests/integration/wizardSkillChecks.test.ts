/**
 * Deklarierte Zuschläge auf Fertigkeitswürfe landen schon beim Zusammenbau im Wert — über den
 * echten Vault, ohne LLM. Thaumaturg legt den WEI-Mod (mind. +1) auf Arkane Kunde und Religion.
 */
import { describe, expect, it } from 'vitest';
import { buildFeaturePrep } from '../../src/lib/services/wizard/featurePrep';
import { wizardDeclaredChoices } from '../../src/lib/services/wizard/wizardChoices';
import { buildWizardCharacter } from '../../src/lib/services/wizard/assembleCharacter';
import type { CharacterWizard } from '../../src/lib/services/wizard/characterWizard.svelte';
import { pointBuyStart } from '../../src/lib/services/wizard/pointBuy';
import { emptySpellcasting } from '../../src/lib/services/spellcasting/write';

const DIVINE_ORDER = 'srd-2024_cleric_divine-order';
const BASICS = {
  species: { sourceKey: 'srd-2024_dwarf', name: 'Zwerg' },
  klass: { sourceKey: 'srd-2024_cleric', name: 'Kleriker' },
  background: { sourceKey: 'srd-2024_soldier', name: 'Soldat' },
};

async function clericWith(order: string) {
  const prep = await buildFeaturePrep(BASICS);
  const params = {
    spellAccess: prep.spellAccess, declared: prep.declared, proficientSkills: [], proficientSaves: [],
    sizeChoice: prep.sizeChoice, tools: [],
  };
  const first = wizardDeclaredChoices({ ...params, declaredAnswers: [] });
  const orderChoice = first.find((ch) => ch.featureKey === DIVINE_ORDER);
  expect(orderChoice, 'Göttliche Ordnung als Wahl').toBeDefined();
  const declaredAnswers = [{ id: orderChoice!.id, choice: order }];
  const declaredChoices = wizardDeclaredChoices({ ...params, declaredAnswers });
  return buildWizardCharacter({
    name: 'Prüfling Thaumaturg', playerName: '', languages: [], alignment: '', appearance: '',
    traits: '', ideals: '', bonds: '', flaws: '',
    ...BASICS,
    scores: pointBuyStart(), asi: {}, chosenSkills: [], masteries: [], fightingStyles: [], traitFeats: {},
    optionPicks: [], spellcasting: emptySpellcasting(), featureSpellPicks: {},
    spellAccess: prep.spellAccess, declared: prep.declared, riders: [],
    declaredChoices, declaredAnswers, spellPickChoices: [],
    hpBonusAtLevelOne: () => 0,
    selectedEquipment: () => ({ items: [], goldPieces: 0 }),
  } as unknown as CharacterWizard);
}

describe('Fertigkeitswerte aus dem Wizard', () => {
  it('rechnen den Thaumaturg-Zuschlag ein, den Beschützer nicht', async () => {
    const thaumaturge = await clericWith('Thaumaturge');
    const protector = await clericWith('Protector');
    // Point-Buy-Start: WEI 8 → −1, das Minimum hebt den Zuschlag auf +1.
    expect(thaumaturge.skills.Religion.value - protector.skills.Religion.value).toBe(1);
    expect(thaumaturge.skills.ArkaneKunde.value - protector.skills.ArkaneKunde.value).toBe(1);
    expect(thaumaturge.skills.Heilkunde.value).toBe(protector.skills.Heilkunde.value);
  });
});
