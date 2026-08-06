/**
 * Anlage von Charakteren: leerer Bogen und Wizard-Ergebnis. Liefert je Weg die
 * Verzeichnis-UID zurück; das Öffnen bleibt Sache des Aufrufers.
 */
import { invoke } from '@tauri-apps/api/core';
import { characterSchema, type Character } from '../schemas/characterSchema';
import type { CharacterJSON } from '../pdf/characterFields';
import { CHARACTERS_PATH, freshCharacterUid } from './characterDirectory';

export { CHARACTERS_PATH };

const gmNotesTemplate = (name: string): string =>
  `# GM-Notizen: ${name}\n\n## Hintergrund\n\n## Geheimnisse & Hooks\n\n## Verbindungen\n\n## Entwicklung\n\n## DM-Notizen\n`;

async function writeCharacter(uid: string, notesName: string, json: CharacterJSON): Promise<void> {
  const dirPath = `${CHARACTERS_PATH}/${uid}`;
  await invoke('write_file_content', { path: `${dirPath}/character.json`, content: JSON.stringify({ ...json, uid }, null, 2) });
  await invoke('write_file_content', { path: `${dirPath}/gm-notes.md`, content: gmNotesTemplate(notesName) });
}

/** Leerer Charakter aus einem eingetippten Namen; null = leere Eingabe oder Schreibfehler. */
export async function createBlankCharacter(rawName: string): Promise<string | null> {
  const raw = rawName.trim();
  if (!raw) return null;
  const name = raw.charAt(0).toUpperCase() + raw.slice(1);
  try {
    const uid = await freshCharacterUid();
    await writeCharacter(uid, name, characterSchema.parse({ name }));
    return uid;
  } catch (err) {
    console.error('Charakter konnte nicht erstellt werden:', err);
    return null;
  }
}

/** Übernimmt den vom Wizard fertig zusammengesetzten Charakter. */
export async function createWizardCharacter(character: Character): Promise<string | null> {
  const raw = (character.name || 'Neuer Charakter').trim();
  try {
    const uid = await freshCharacterUid();
    await writeCharacter(uid, raw, character);
    return uid;
  } catch (err) {
    console.error('Charakter konnte nicht erstellt werden:', err);
    return null;
  }
}
