/**
 * Vielseitig (Mensch): ein Herkunftstalent zur Wahl, ohne KI — Angebot aus der Bibliothek,
 * Deklaration des gewählten Talents im Wizard-Eingang, Talent-Link am Charakter.
 *
 *   npm run test -- traitFeat
 */
import { describe, expect, it } from 'vitest';
import { getFeats } from '../../src/lib/featsLibrary';
import { loadTraitFeatOffers, traitFeatOffers } from '../../src/lib/services/traitFeat';
import { buildFeaturePrep } from '../../src/lib/services/wizard/featurePrep';
import { featLinks, wizardGrantInput } from '../../src/lib/services/wizard/castingDraft';
import { collectGrants } from '../../src/lib/services/proficiencyGrants';
import { featureChoiceGrantSchema } from '../../src/lib/schemas/featureChoice';

const HUMAN_SAGE = {
  species: { sourceKey: 'srd-2024_human', name: 'Mensch' },
  klass: { sourceKey: 'srd-2024_fighter', name: 'Kämpfer' },
  background: { sourceKey: 'srd-2024_sage', name: 'Weiser' },
};
const VERSATILE = 'srd-2024_human_versatile';
const SKILLED = 'srd-2024_skilled';

describe('Talentwahl aus einem Speziesmerkmal', () => {
  it('bietet dem Menschen die Herkunftstalente an, ohne das des Hintergrunds', async () => {
    const [offer, ...rest] = await loadTraitFeatOffers(HUMAN_SAGE.species.sourceKey, HUMAN_SAGE.background.sourceKey);
    expect(rest).toEqual([]);
    expect([offer.featureKey, offer.featCategory, offer.allowance]).toEqual([VERSATILE, 'Origin', 1]);

    const origin = (await getFeats()).filter((f) => f.category === 'Origin').map((f) => f.sourceKey);
    expect(offer.options.map((o) => o.sourceKey)).toContain(SKILLED);
    expect(offer.recommended, 'Vielseitig empfiehlt Begabt').toEqual([SKILLED]);
    expect(offer.options.map((o) => o.sourceKey), 'Weiser bringt Eingeweihter der Magie schon mit')
      .not.toContain('srd-2024_magic-initiate');
    expect(offer.options.every((o) => origin.includes(o.sourceKey))).toBe(true);
  });

  it('lässt Spezies ohne Talentwahl und den Kampfstil außen vor', async () => {
    expect(await loadTraitFeatOffers('srd-2024_dwarf', HUMAN_SAGE.background.sourceKey)).toEqual([]);
    const style = {
      key: 'homebrew_x',
      name: 'Style',
      grantsChoice: [featureChoiceGrantSchema.parse({ kind: 'featCategory', featCategory: 'Fighting Style' })],
    };
    expect(traitFeatOffers([style], await getFeats(), [])).toEqual([]);
  });

  it('bringt die Deklaration des gewählten Talents in den Wizard-Eingang', async () => {
    const prep = await buildFeaturePrep({ ...HUMAN_SAGE, traitFeats: [SKILLED] });
    expect(prep.declared.some((f) => f.key === SKILLED && f.source === 'feat')).toBe(true);
    expect(prep.summaryClass.find((s) => s.name === 'Skilled')?.group).toBe('Mensch');
    expect((await buildFeaturePrep(HUMAN_SAGE)).declared.some((f) => f.key === SKILLED)).toBe(false);
  });

  const draft = {
    ...HUMAN_SAGE,
    fightingStyles: ['srd-2024_archery'],
    traitFeats: { [VERSATILE]: [SKILLED] },
  } as unknown as Parameters<typeof featLinks>[0];

  it('legt das Talent als Link am Charakter ab', () => {
    expect(featLinks(draft).map((l) => l.sourceKey)).toEqual(['srd-2024_archery', SKILLED]);
  });

  it('stellt die Fertigkeitswahl von Begabt im Übungsschritt', async () => {
    const grants = await collectGrants(wizardGrantInput(draft));
    expect(grants.choices.find((c) => c.source.sourceKey === SKILLED)?.choose).toBe(3);
  });
});
