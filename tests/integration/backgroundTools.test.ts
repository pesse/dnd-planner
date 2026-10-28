import { describe, expect, it } from 'vitest';
import { collectGrants } from '../../src/lib/services/proficiencyGrants';
import { buildFeaturePrep } from '../../src/lib/services/wizard/featurePrep';
import { wizardDeclaredChoices, wizardRiders } from '../../src/lib/services/wizard/wizardChoices';
import { getItemsByDir } from '../../src/lib/itemLibrary';

const soldierBasics = {
  species: { sourceKey: 'srd-2024_human', name: 'Mensch' },
  klass: { sourceKey: 'srd-2024_fighter', name: 'Kämpfer' },
  background: { sourceKey: 'srd-2024_soldier', name: 'Soldat' },
};

describe('Werkzeug-Übung aus dem Hintergrund', () => {
  it('sammelt das feste Werkzeug des Hintergrunds mit Herkunft', async () => {
    const grants = await collectGrants({ backgroundRef: { sourceKey: 'srd-2024_sage' } });
    expect(grants.tools.map((g) => [g.value, g.source.sourceKey])).toEqual([['Kalligrafiewerkzeug', 'srd-2024_sage']]);
  });

  it('sammelt bei einer Werkzeug-Wahl nichts — die fragt der Wizard', async () => {
    const grants = await collectGrants({ backgroundRef: { sourceKey: 'phb-2024_artisan' } });
    expect(grants.tools).toEqual([]);
  });

  it('fragt die Werkzeug-Wahl des Hintergrunds mit den Spielsets der Bibliothek ab', async () => {
    const prep = await buildFeaturePrep(soldierBasics);
    const declared = prep.declared.filter((f) => f.source === 'background');
    expect(declared.map((f) => [f.key, f.nameDe])).toEqual([['srd-2024_soldier', 'Soldat']]);

    const tools = await getItemsByDir('tools');
    const choices = wizardDeclaredChoices({
      spellAccess: [], declaredAnswers: [], declared: prep.declared, proficientSkills: [], sizeChoice: null, tools,
    }).filter((c) => c.featureKey === 'srd-2024_soldier');
    expect(choices).toHaveLength(1);
    expect(choices[0].type).toBe('multiselect');
    expect(choices[0].options?.length).toBeGreaterThan(1);

    const pick = choices[0].options![0];
    const riders = wizardRiders({ declared: prep.declared, declaredAnswers: [{ id: choices[0].id, choice: pick }] })
      .filter((r) => r.featureKey === 'srd-2024_soldier');
    expect(riders.map((r) => [r.source, r.proficiencies.tools])).toEqual([['background', [pick]]]);
  });

  it('deklariert die Wahl an genau den Hintergründen, deren Werkzeug offen ist', async () => {
    const keys = ['phb-2024_artisan', 'phb-2024_entertainer', 'phb-2024_guard', 'phb-2024_noble', 'srd-2024_soldier'];
    for (const key of keys) {
      const prep = await buildFeaturePrep({ ...soldierBasics, background: { sourceKey: key, name: key } });
      expect(prep.declared.some((f) => f.source === 'background'), key).toBe(true);
    }
    const sage = await buildFeaturePrep({ ...soldierBasics, background: { sourceKey: 'srd-2024_sage', name: 'Weiser' } });
    expect(sage.declared.some((f) => f.source === 'background')).toBe(false);
  });
});
