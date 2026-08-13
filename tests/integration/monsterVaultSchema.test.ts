/**
 * Jede Monsterdatei des ECHTEN Vaults muss `parseMonster` bestehen — global wie akt-lokal.
 * Das war die Lücke, die den Umbau auf das Open5e-Format unabgesichert ließ: der Ladepfad
 * verschluckt eine ungültige Datei still (die Karte zeigt Schema-Hinweise, der Test niemand).
 *
 * `parseMonster` fährt `migrateMonsterLegacy` mit, deshalb gilt das auch für noch nicht
 * migrierte Dateien: ein Fehler hier ist ein echter Datenfehler, keine Altlast.
 *
 *   npm run test -- monsterVaultSchema
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMonster } from '../../src/lib/utils/schemaValidation';
import { MONSTER_TYPE_DIR } from '../../src/lib/types';

function monsterFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) monsterFiles(full, out);
    else if (entry.name.endsWith('.json') && /\/monsters\//.test(`${full}`)) out.push(full);
  }
  return out;
}

const files = [...monsterFiles('vault/monsters'), ...monsterFiles('vault/campaigns')];

describe('Monster im Vault', () => {
  it('findet Monsterdateien', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files)('%s parst gegen das Schema', (file) => {
    const parsed = parseMonster(JSON.parse(readFileSync(file, 'utf8')));
    expect(parsed.ok ? [] : parsed.errors).toEqual([]);
  });

  it('legt jedes globale Monster im Ordner seines Creature-Types ab', () => {
    const wrong: string[] = [];
    for (const file of files.filter((f) => f.startsWith('vault/monsters/'))) {
      const parsed = parseMonster(JSON.parse(readFileSync(file, 'utf8')));
      if (!parsed.ok) continue; // der Parse-Test oben meldet das schon
      const expected = `vault/monsters/${MONSTER_TYPE_DIR[parsed.data.type]}/`;
      if (!file.startsWith(expected)) wrong.push(`${file} → erwartet unter ${expected}`);
    }
    expect(wrong).toEqual([]);
  });
});
