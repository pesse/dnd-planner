/**
 * Der gemeinsame Endstand von Editor-Swap und Aufstiegs-Vorschau.
 *
 *   npm run test -- characterWithChanges
 */
import { describe, expect, it } from 'vitest';
import { characterSchema } from '../../src/lib/schemas/characterSchema';
import { computeLevelUpDelta } from '../../src/lib/services/levelUp';
import { baseDeltaChanges } from '../../src/lib/services/levelUp/changes';
import { characterWithChanges } from '../../src/lib/services/characterWithChanges';

describe('characterWithChanges', () => {
  it('hebt die Klassenstufe und lässt den Ausgangsstand unberührt', async () => {
    const base = characterSchema.parse({ name: 'Testfigur', hitDice: '1W10', classes: [{ sourceKey: 'srd-2024_fighter', name: 'Kämpfer', level: 4 }] });
    const delta = await computeLevelUpDelta(base, 0, 5);
    const next = characterWithChanges(base, baseDeltaChanges(delta, base.hitDice), { classIndex: 0 }, delta);

    expect(next.classes[0].level).toBe(5);
    expect(next.proficiencyBonus).toBe(3);
    expect(next.classLevel).toContain('5');
    expect(base.classes[0].level).toBe(4);
  });
});
