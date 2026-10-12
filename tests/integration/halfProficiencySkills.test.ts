/**
 * Alleskönner als Grant statt KI-Deutung: die Deklaration im Vault setzt `alleskoenner`.
 *
 *   npm run test -- halfProficiencySkills
 */
import { describe, expect, it } from 'vitest';
import { characterSchema } from '../../src/lib/schemas/characterSchema';
import { applyChanges } from '../../src/lib/services/applyChanges';
import { getProgressionByKey } from '../../src/lib/services/classProgression';
import { declaredFeatures as tagged } from '../../src/lib/services/declaredFeature';
import { declaredGrantChanges } from '../../src/lib/services/declaration/grants';

describe('Alleskönner', () => {
  it('setzt den Bogenschalter aus der Deklaration des Barden', async () => {
    const jack = (await getProgressionByKey('srd-2024_bard'))?.features.find((f) => f.key === 'srd-2024_bard_jack-of-all-trades');
    expect(jack?.grants?.halfProficiencySkills, 'die Deklaration im Vault').toBe(true);

    const c = characterSchema.parse({ name: 'Prüfling Alleskönner' });
    expect(c.alleskoenner).toBe(false);
    applyChanges(c, declaredGrantChanges(tagged('class', [jack!]), { step: 'test', source: 'test' }), { classIndex: 0 });
    expect(c.alleskoenner).toBe(true);
  });
});
