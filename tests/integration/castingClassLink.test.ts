/**
 * Die zwei Abbrüche, an denen eine Klasse aus dem Zauberwirken verschwand, ohne dass irgendwo
 * stand warum: kein Bibliotheks-Link und ein Key, den der Vault nicht führt.
 *
 *   npm run test -- castingClassLink
 */
import { describe, expect, it } from 'vitest';
import { characterSchema, type Character } from '../../src/lib/schemas/characterSchema';
import { resolveCasting } from '../../src/lib/services/spellcasting/resolve';

const withClass = (cls: Record<string, unknown>): Character =>
  characterSchema.parse({
    name: 'Test',
    classes: [cls],
    mods: { wis: 3 },
    proficiencyBonus: 2,
  });

describe('Klassen-Link als Meldung', () => {
  it('meldet die unverknüpfte Klasse mit ihrem Namen', async () => {
    const { sources, issues } = await resolveCasting(
      withClass({ sourceKey: '', name: 'Kämpferin', level: 2 }),
    );
    expect(sources).toEqual([]);
    expect(issues).toEqual([{ kind: 'unlinkedClass', featureKey: '', detail: 'Kämpferin' }]);
  });

  it('meldet einen Key, den die Bibliothek nicht führt', async () => {
    const { issues } = await resolveCasting(
      withClass({ sourceKey: 'srd-2024_artificer', name: 'Artificer', level: 3 }),
    );
    expect(issues).toEqual([
      { kind: 'unknownClassKey', featureKey: '', detail: 'srd-2024_artificer' },
    ]);
  });

  it('meldet auch eine unbekannte Subklasse, ohne die Klasse zu verlieren', async () => {
    const { sources, issues } = await resolveCasting(
      withClass({
        sourceKey: 'srd-2024_cleric',
        name: 'Kleriker',
        subclassKey: 'homebrew-sam_domaene-des-nichts',
        subclassName: 'Domäne des Nichts',
        level: 3,
      }),
    );
    expect(issues.map((i) => i.kind)).toEqual(['unknownClassKey']);
    expect(sources.map((s) => s.id)).toContain('srd-2024_cleric_spellcasting');
  });

  it('schweigt, wenn alles verknüpft ist', async () => {
    const { issues } = await resolveCasting(
      withClass({ sourceKey: 'srd-2024_cleric', name: 'Kleriker', level: 1 }),
    );
    expect(issues).toEqual([]);
  });
});
