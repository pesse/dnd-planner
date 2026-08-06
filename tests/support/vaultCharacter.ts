/**
 * Charaktere aus dem Repo-Vault laden. Der Ordnername ist eine UID und damit für einen
 * Test nicht schreibbar — adressiert wird über den Namen aus der `character.json`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { characterSchema, type Character } from '../../src/lib/schemas/characterSchema';
import { upgradeCharacter } from '../../src/lib/schemas/characterUpgrades';

const CHARACTERS_DIR = 'vault/characters';

function rawByName(): Map<string, unknown> {
  const byName = new Map<string, unknown>();
  for (const dir of readdirSync(CHARACTERS_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    try {
      const raw = JSON.parse(readFileSync(`${CHARACTERS_DIR}/${dir.name}/character.json`, 'utf-8'));
      const name = typeof raw.name === 'string' ? raw.name.trim() : '';
      if (name) byName.set(name.toLowerCase(), raw);
    } catch {
      // Ordner ohne lesbare character.json ist für die Tests kein Charakter.
    }
  }
  return byName;
}

/** Ein Vault-Charakter über seinen Namen; fehlt er, ist das ein Testfehler, kein Skip. */
export function vaultCharacter(name: string): Character {
  const raw = rawByName().get(name.trim().toLowerCase());
  if (!raw) {
    const known = [...rawByName().keys()].join(', ');
    throw new Error(`Charakter „${name}" nicht im Vault (vorhanden: ${known})`);
  }
  return characterSchema.parse(upgradeCharacter(raw).data);
}
