/**
 * Bewegung und Sinne aus dem ECHTEN Vault, samt gewählter Option.
 *
 *   npm run test -- movementVault
 */
import { describe, expect, it } from 'vitest';
import { characterMovement } from '../../src/lib/services/movement';
import { declaredSpeed } from '../../src/lib/services/characterProperties';
import { ownedGrantFeatures } from '../../src/lib/services/hitPoints';
import { characterSchema } from '../../src/lib/schemas/characterSchema';

async function movementOf(c: Record<string, unknown>) {
  const features = await ownedGrantFeatures(characterSchema.parse({ name: 'Prüfling', ...c }));
  return {
    speedFeet: declaredSpeed(features)?.feet,
    lines: characterMovement(features, declaredSpeed(features)?.feet ?? null).map((l) => [l.labelDe, l.valueDe, l.whenDe]),
  };
}

const elf = (lineage: string) => ({
  species: { sourceKey: 'srd-2024_elf', name: 'Elf' },
  classes: [{ sourceKey: 'srd-2024_rogue', name: 'Schurke', level: 1 }],
  features: [{ sourceKey: 'srd-2024_elf_elven-lineage', name: 'Elfische Abstammung', choice: lineage }],
});

describe('Bewegung und Sinne aus dem Vault', () => {
  it('Drow: die Abstammung hebt die Dunkelsicht auf 36 m', async () => {
    expect((await movementOf(elf('Drow'))).lines).toEqual([['Dunkelsicht', '36 m', '']]);
  });

  it('Waldelf: die Abstammung legt die Grundbewegungsrate fest', async () => {
    const out = await movementOf(elf('Wood Elf'));
    expect(out.speedFeet).toBe(35);
    expect(out.lines).toEqual([['Dunkelsicht', '18 m', '']]);
  });

  it('Zwerg-Waldläufer 6: Klettern und Schwimmen wie die Bewegungsrate, der Zuschlag unter Vorbehalt', async () => {
    const out = await movementOf({
      species: { sourceKey: 'srd-2024_dwarf', name: 'Zwerg' },
      classes: [{ sourceKey: 'srd-2024_ranger', name: 'Waldläufer', level: 6 }],
    });
    expect(out.lines).toEqual(expect.arrayContaining([
      ['Klettern', '9 m', ''],
      ['Schwimmen', '9 m', ''],
      ['Dunkelsicht', '36 m', ''],
      ['Bewegungsrate', '+3 m', 'sofern du keine schwere Rüstung trägst'],
    ]));
  });

  it('Mönch: die Ungerüstete Bewegung wächst mit der Mönchsstufe', async () => {
    const monk = (level: number) => movementOf({
      species: { sourceKey: 'srd-2024_human', name: 'Mensch' },
      classes: [{ sourceKey: 'srd-2024_monk', name: 'Mönch', level }],
    });
    const unarmored = (lines: string[][]) => lines.filter((l) => l[2] === 'sofern du weder Rüstung noch Schild trägst');
    expect(unarmored((await monk(1)).lines)).toEqual([]);
    expect(unarmored((await monk(6)).lines)).toEqual([['Bewegungsrate', '+4,5 m', 'sofern du weder Rüstung noch Schild trägst']]);
    expect(unarmored((await monk(18)).lines)).toEqual([['Bewegungsrate', '+9 m', 'sofern du weder Rüstung noch Schild trägst']]);
  });
});
