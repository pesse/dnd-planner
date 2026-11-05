/**
 * Vielseitig (Mensch): ein Herkunftstalent zur Wahl, ohne KI — Angebot aus der Bibliothek,
 * Deklaration des gewählten Talents im Wizard-Eingang, Talent-Link am Charakter.
 *
 *   npm run test -- traitFeat
 */
import { describe, expect, it } from 'vitest';
import { getFeats } from '../../src/lib/featsLibrary';
import { loadTraitFeatOffers, traitFeatOffers, traitFeatQuota, traitFeatStatus } from '../../src/lib/services/traitFeat';
import { buildFeaturePrep } from '../../src/lib/services/wizard/featurePrep';
import { featLinks, wizardGrantInput } from '../../src/lib/services/wizard/castingDraft';
import { collectGrants } from '../../src/lib/services/proficiencyGrants';
import { featureChoiceGrantSchema } from '../../src/lib/schemas/featureChoice';
import { featInstances, grantedInstanceId } from '../../src/lib/services/declaration/featInstances';

const HUMAN_SAGE = {
  species: { sourceKey: 'srd-2024_human', name: 'Mensch' },
  klass: { sourceKey: 'srd-2024_fighter', name: 'Kämpfer' },
  background: { sourceKey: 'srd-2024_sage', name: 'Weiser' },
};
const VERSATILE = 'srd-2024_human_versatile';
const SKILLED = 'srd-2024_skilled';
const MAGIC_INITIATE = 'srd-2024_magic-initiate';

describe('Talentwahl aus einem Speziesmerkmal', () => {
  it('bietet dem Menschen alle Herkunftstalente an und markiert das des Hintergrunds', async () => {
    const [offer, ...rest] = await loadTraitFeatOffers(HUMAN_SAGE.species.sourceKey, HUMAN_SAGE.background.sourceKey);
    expect(rest).toEqual([]);
    expect([offer.featureKey, offer.featCategory, offer.allowance]).toEqual([VERSATILE, 'Origin', 1]);

    const origin = (await getFeats()).filter((f) => f.category === 'Origin').map((f) => f.sourceKey);
    expect(offer.options.map((o) => o.sourceKey)).toContain(SKILLED);
    expect(offer.recommended, 'Vielseitig empfiehlt Begabt').toEqual([SKILLED]);
    expect(offer.options.map((o) => o.sourceKey).sort()).toEqual([...origin].sort());
    expect(offer.owned, 'Weiser bringt Eingeweihter der Magie schon mit').toEqual([MAGIC_INITIATE]);
    expect(offer.ownedVia).toContain('Hintergrund');
  });

  it('erklärt, warum ein vorhandenes Talent (nicht) noch einmal wählbar ist', async () => {
    const [offer] = await loadTraitFeatOffers(HUMAN_SAGE.species.sourceKey, 'srd-2024_criminal');
    const status = (key: string) => traitFeatStatus(offer, offer.options.find((o) => o.sourceKey === key)!);
    expect(status('srd-2024_alert')).toMatchObject({ pickable: false });
    expect(status('srd-2024_alert').note).toMatch(/nicht wiederholbar/);
    expect(status(SKILLED)).toEqual({ pickable: true, note: '' });
    expect(traitFeatQuota(offer)).toBe(1);

    const [sage] = await loadTraitFeatOffers(HUMAN_SAGE.species.sourceKey, HUMAN_SAGE.background.sourceKey);
    const twin = traitFeatStatus(sage, sage.options.find((o) => o.sourceKey === MAGIC_INITIATE)!);
    expect(twin.pickable).toBe(true);
    expect(twin.note).toMatch(/zweites Mal/);
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
    const prep = await buildFeaturePrep({ ...HUMAN_SAGE, traitFeats: [{ key: SKILLED, grantedBy: VERSATILE }] });
    expect(prep.declared.some((f) => f.key === SKILLED && f.source === 'feat')).toBe(true);
    expect(prep.summaryClass.find((s) => s.name === 'Skilled')?.group).toBe('Mensch');
    expect((await buildFeaturePrep(HUMAN_SAGE)).declared.some((f) => f.key === SKILLED)).toBe(false);
  });

  const draft = {
    ...HUMAN_SAGE,
    fightingStyles: ['srd-2024_archery'],
    traitFeats: { [VERSATILE]: [SKILLED] },
  } as unknown as Parameters<typeof featLinks>[0];

  it('legt das Talent als Link am Charakter ab, mit dem Merkmal, das es vergab', () => {
    expect(featLinks(draft).map((l) => [l.sourceKey, l.grantedBy])).toEqual([
      ['srd-2024_archery', undefined],
      [SKILLED, VERSATILE],
    ]);
  });

  it('führt das Talent des Hintergrunds und dasselbe aus Vielseitig als zwei Instanzen', async () => {
    const twinDraft = { ...draft, fightingStyles: [], traitFeats: { [VERSATILE]: [MAGIC_INITIATE] } } as typeof draft;
    const instances = await featInstances(featLinks(twinDraft), { sourceKey: HUMAN_SAGE.background.sourceKey, name: '' } as never);
    const mi = instances.filter((i) => i.featureKey === MAGIC_INITIATE);
    expect(mi.map((i) => i.sourceId)).toEqual([MAGIC_INITIATE, grantedInstanceId(MAGIC_INITIATE, VERSATILE)]);
    expect(mi[0].specialisation, 'nur das des Hintergrunds trägt dessen Vorgabe').not.toBe('');
    expect(mi[1].specialisation).toBe('');

    const prep = await buildFeaturePrep({ ...HUMAN_SAGE, traitFeats: [{ key: MAGIC_INITIATE, grantedBy: VERSATILE }] });
    const grants = prep.spellAccess.filter((g) => g.featureKey === MAGIC_INITIATE);
    expect(grants.map((g) => g.sourceId), 'Wizard und Charakter vergeben dieselben Ids')
      .toEqual(mi.map((i) => i.sourceId));
    expect(grants[0].lists).toHaveLength(1);
    expect(grants[1].lists.length).toBeGreaterThan(1);
  });

  it('hält ein von Hand verlinktes Herkunftstalent mit dem des Hintergrunds zusammen', async () => {
    const manual = featLinks({ ...draft, fightingStyles: [MAGIC_INITIATE], traitFeats: {} } as typeof draft);
    const instances = await featInstances(manual, { sourceKey: HUMAN_SAGE.background.sourceKey, name: '' } as never);
    expect(instances.filter((i) => i.featureKey === MAGIC_INITIATE)).toHaveLength(1);
  });

  it('stellt die Fertigkeitswahl von Begabt im Übungsschritt', async () => {
    const grants = await collectGrants(wizardGrantInput(draft));
    expect(grants.choices.find((c) => c.source.sourceKey === SKILLED)?.choose).toBe(3);
  });
});
