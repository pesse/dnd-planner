/**
 * Resistenzen aus dem ECHTEN Vault: am Merkmal selbst und an der gewählten Option.
 *
 *   npm run test -- defensesVault
 */
import { describe, expect, it } from 'vitest';
import { characterDefenses } from '../../src/lib/services/defenses';
import { ownedGrantFeatures } from '../../src/lib/services/hitPoints';
import { characterSchema } from '../../src/lib/schemas/characterSchema';

async function defensesOf(c: Record<string, unknown>) {
  const character = characterSchema.parse({ name: 'Prüfling', ...c });
  return characterDefenses(await ownedGrantFeatures(character), 2)
    .map((d) => [d.labelDe, d.textDe, d.effect.conditionDe ?? '']);
}

describe('Resistenzen aus dem Vault', () => {
  it('Drachenblütiger: die gewählte Abstammung bringt ihre Resistenz mit', async () => {
    const out = await defensesOf({
      species: { sourceKey: 'srd-2024_dragonborn', name: 'Drachenblütiger' },
      classes: [{ sourceKey: 'srd-2024_fighter', name: 'Kämpfer', level: 1 }],
      features: [{ sourceKey: 'srd-2024_dragonborn_draconic-ancestry', name: 'Drachenabstammung', choice: 'Red', choiceDe: 'Rot' }],
    });
    expect(out).toEqual([[expect.stringContaining('(Rot)'), 'Resistenz gegen Feuerschaden', '']]);
  });

  it('ohne Antwort keine Resistenz', async () => {
    const out = await defensesOf({
      species: { sourceKey: 'srd-2024_dragonborn', name: 'Drachenblütiger' },
      classes: [{ sourceKey: 'srd-2024_fighter', name: 'Kämpfer', level: 1 }],
    });
    expect(out).toEqual([]);
  });

  it('Zwerg-Barbar: feste Giftresistenz und die des Kampfrauschs mit ihrer Lage', async () => {
    const out = await defensesOf({
      species: { sourceKey: 'srd-2024_dwarf', name: 'Zwerg' },
      classes: [{ sourceKey: 'srd-2024_barbarian', name: 'Barbar', level: 1 }],
    });
    expect(out).toContainEqual([expect.any(String), 'Resistenz gegen Giftschaden', '']);
    expect(out).toContainEqual([expect.any(String), 'Resistenz gegen Wuchtschaden, Stichschaden, Hiebschaden', 'solange dein Kampfrausch aktiv ist']);
  });
});
