/**
 * Die „Prüfling"-Charaktere aus `tests/fixtures/characters/`, adressiert über den Namen aus
 * der Datei. Bespielte Vault-Charaktere ändern sich mit jeder Sitzung und taugen nicht als Testdaten.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { characterSchema, type Character } from '../../src/lib/schemas/characterSchema';
import { upgradeCharacter } from '../../src/lib/schemas/characterUpgrades';

const CHARACTERS_DIR = 'tests/fixtures/characters';

function rawByName(): Map<string, unknown> {
  const byName = new Map<string, unknown>();
  for (const file of readdirSync(CHARACTERS_DIR)) {
    if (!file.endsWith('.json')) continue;
    const raw = JSON.parse(readFileSync(`${CHARACTERS_DIR}/${file}`, 'utf-8'));
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (name) byName.set(name.toLowerCase(), raw);
  }
  return byName;
}

/** Fehlt der Charakter, ist das ein Testfehler, kein Skip. */
export function testCharacter(name: string): Character {
  const raw = rawByName().get(name.trim().toLowerCase());
  if (!raw) {
    const known = [...rawByName().keys()].join(', ');
    throw new Error(`Testcharakter „${name}" fehlt (vorhanden: ${known})`);
  }
  return characterSchema.parse(upgradeCharacter(raw).data);
}
