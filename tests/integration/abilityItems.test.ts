/**
 * Attribut setzende Gegenstände im ECHTEN Vault: jede Familie trägt ihren Wert, und er wirkt
 * erst angelegt und eingestimmt.
 *
 *   npm run test -- abilityItems
 */
import { describe, expect, it } from 'vitest';
import { effectiveScores, loadWornAbilityEffects } from '../../src/lib/services/effectiveAbilities';
import { abilityRecordOf } from '../../src/lib/schemas/abilities';
import type { CharacterInventoryEntry } from '../../src/lib/schemas/characterSchema';

const BASE = abilityRecordOf(() => 10);
const effective = async (lines: CharacterInventoryEntry[]) => effectiveScores(BASE, await loadWornAbilityEffects(lines));

const worn = (name: string, attuned = true): CharacterInventoryEntry =>
  ({ name, count: '1', weight: '', equipped: true, attuned });

describe('Attributswerte aus dem Inventar', () => {
  it.each([
    ['Amulett der Gesundheit', { con: 19 }],
    ['Handschuhe der Ogerstärke', { str: 19 }],
    ['Stirnband der Intelligenz', { int: 19 }],
    ['srd-2024_belt-of-giant-strength-hill', { str: 21 }],
    ['srd-2024_belt-of-giant-strength-frost-or-stone', { str: 23 }],
    ['srd-2024_belt-of-giant-strength-fire', { str: 25 }],
    ['srd-2024_belt-of-giant-strength-cloud', { str: 27 }],
    ['srd-2024_belt-of-giant-strength-storm', { str: 29 }],
  ])('%s setzt %o', async (ref, set) => {
    const line = ref.startsWith('srd-2024_') ? { ...worn(''), sourceKey: ref } : worn(ref);
    expect(await effective([line])).toEqual({ ...BASE, ...set });
  });

  it('nicht eingestimmt setzt das Amulett nichts', async () => {
    expect(await effective([worn('Amulett der Gesundheit', false)])).toEqual(BASE);
  });

  it.each(['srd-2024_hammer-of-thunderbolts-maul', 'srd-2024_hammer-of-thunderbolts-warhammer'])(
    '%s hebt Gürtel und Handschuhe um 4',
    async (hammer) => {
      const h = { ...worn(''), sourceKey: hammer };
      const belt = { ...worn(''), sourceKey: 'srd-2024_belt-of-giant-strength-fire' };
      expect((await effective([h, belt])).str).toBe(29);
      expect((await effective([h, worn('Handschuhe der Ogerstärke')])).str).toBe(23);
      expect((await effective([h])).str).toBe(10);
    },
  );
});
