/**
 * Die Fallen des ECHTEN Vaults über den Ladeweg der App: Schema, Schlüssel und würfelbare Schäden.
 *
 *   npm run test -- trapsVault
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { trapSchema } from '../../src/lib/schemas/trap';
import { getTraps } from '../../src/lib/trapsLibrary';
import { damageFormula, trapTiers } from '../../src/lib/services/trapFormat';
import { parsePool } from '../../src/lib/utils/dice';

const files = readdirSync('vault/traps').filter((f) => f.endsWith('.json'));

describe('Fallen aus dem Vault', () => {
  it.each(files)('%s erfüllt das Schema, der Schlüssel folgt dem Dateinamen', (file) => {
    const raw = JSON.parse(readFileSync(`vault/traps/${file}`, 'utf8')) as { source: string };
    const trap = trapSchema.parse(raw);
    expect(trap.key).toBe(`${trap.source}_${file.replace(/\.json$/, '')}`);
    expect(trap.nameDe && trap.descDe && trap.triggerDe).toBeTruthy();
  });

  it('lädt jede Falle mit würfelbarem Schaden auf allen Stufen', async () => {
    const traps = await getTraps();
    expect(traps).toHaveLength(files.length);
    for (const t of traps) {
      for (const tier of trapTiers(t)) {
        if (tier.damage.length) expect(parsePool(damageFormula(tier.damage)), `${t.key} ${tier.levels}`).not.toBeNull();
      }
    }
  });
});
