/**
 * Anpassungen am Charakter: ein Zu- oder Abschlag auf einen Vorrat, ohne Homebrew-Gegenstand.
 *
 *   npm run test -- resourceAdjustments
 */
import { describe, expect, it } from 'vitest';
import { characterSchema, type Character } from '../../src/lib/schemas/characterSchema';
import type { ResourceAdjustment } from '../../src/lib/schemas/resource';
import { refOf, resolveResources, type ResolvedResource } from '../../src/lib/services/resources/resolve';

const RAGE = 'srd-2024_barbarian_rage';
const isRage = (p: ResolvedResource) => p.featureKey === RAGE;
const isSlots = (p: ResolvedResource) => p.kind === 'slots';

const character = (sourceKey: string, resourceAdjustments: ResourceAdjustment[] = []): Character =>
  characterSchema.parse({
    name: 'Grum Steinfaust',
    classes: [{ sourceKey, name: 'Testklasse', level: 3 }],
    resourceAdjustments,
  });

const pool = async (c: Character, pick: (p: ResolvedResource) => boolean) =>
  (await resolveResources(c)).pools.find(pick);

describe('Vorrats-Anpassungen', () => {
  it('addiert und zieht ab, nie unter null, und nennt den Anlass', async () => {
    const target = refOf((await pool(character('srd-2024_barbarian'), isRage))!);

    const up = await pool(character('srd-2024_barbarian', [{ target, amount: 1, reason: 'Segen' }]), isRage);
    expect(up?.max[0]).toBe(4);
    expect(up?.additions).toEqual([{ labelDe: 'Segen', amount: 1 }]);

    const down = await pool(character('srd-2024_barbarian', [{ target, amount: -9, reason: '' }]), isRage);
    expect(down?.max[0]).toBe(0);
    expect(down?.additions).toEqual([{ labelDe: 'Anpassung', amount: -9 }]);
  });

  it('trifft bei Zauberplätzen nur den gewählten Grad', async () => {
    const before = (await pool(character('srd-2024_wizard'), isSlots))!;
    const after = await pool(
      character('srd-2024_wizard', [{ target: refOf(before), amount: 1, grade: 2, reason: 'Segen' }]),
      isSlots,
    );

    expect(after?.max[0]).toBe(before.max[0]);
    expect(after?.max[1]).toBe((before.max[1] ?? 0) + 1);
    expect(after?.additions.at(-1)).toEqual({ labelDe: 'Segen (Grad 2)', amount: 1 });
  });

  it('übergeht ein Ziel, das es nicht gibt', async () => {
    const target = { feature: 'gibt-es-nicht', pool: 'x', shared: '' };
    const { pools } = await resolveResources(character('srd-2024_barbarian', [{ target, amount: 3, reason: '' }]));

    expect(pools.find(isRage)?.max[0]).toBe(3);
  });
});
