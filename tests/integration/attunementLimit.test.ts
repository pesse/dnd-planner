/**
 * Einstimmungsgrenze aus dem ECHTEN Vault.
 *
 *   npm run test -- attunementLimit
 */
import { describe, expect, it } from 'vitest';
import { attunementLimit } from '../../src/lib/services/wornItems';
import { ownedGrantFeatures } from '../../src/lib/services/hitPoints';
import { characterSchema } from '../../src/lib/schemas/characterSchema';

const rogue = (level: number) => ownedGrantFeatures(characterSchema.parse({
  name: 'Prüfling',
  classes: [{ sourceKey: 'srd-2024_rogue', subclassKey: 'srd-2024_thief', name: 'Schurke', level }],
}));

describe('Einstimmungsgrenze', () => {
  it('drei nach der Grundregel, vier mit Magische Geräte benutzen ab Dieb 13', async () => {
    expect(attunementLimit(await rogue(12))).toEqual({ max: 3 });
    expect(attunementLimit(await rogue(13))).toEqual({ max: 4, labelDe: expect.any(String) });
  });
});
