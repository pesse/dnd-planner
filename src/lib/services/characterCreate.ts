/**
 * Anlage von Charakteren aus dem Wizard oder Import. Liefert die
 * Verzeichnis-UID zurück; das Öffnen bleibt Sache des Aufrufers.
 */
import { invoke } from '@tauri-apps/api/core';
import type { Character } from '../schemas/characterSchema';
import { CHARACTERS_PATH, freshCharacterUid } from './characterDirectory';

export { CHARACTERS_PATH };

const gmNotesTemplate = (name: string): string =>
  `# GM-Notizen: ${name}\n\n## Hintergrund\n\n## Geheimnisse & Hooks\n\n## Verbindungen\n\n## Entwicklung\n\n## DM-Notizen\n`;

async function writeCharacter(uid: string, notesName: string, json: Character): Promise<void> {
  const dirPath = `${CHARACTERS_PATH}/${uid}`;
  await invoke('write_file_content', { path: `${dirPath}/character.json`, content: JSON.stringify({ ...json, uid }, null, 2) });
  await invoke('write_file_content', { path: `${dirPath}/gm-notes.md`, content: gmNotesTemplate(notesName) });
}

/** Übernimmt einen fertig zusammengesetzten Charakter (Wizard, Import); `details` → `details.md`. */
export async function createWizardCharacter(character: Character, details = ''): Promise<string | null> {
  const raw = (character.name || 'Neuer Charakter').trim();
  try {
    const uid = await freshCharacterUid();
    await writeCharacter(uid, raw, character);
    if (details.trim()) {
      await invoke('write_file_content', { path: `${CHARACTERS_PATH}/${uid}/details.md`, content: details });
    }
    return uid;
  } catch (err) {
    console.error('Charakter konnte nicht erstellt werden:', err);
    return null;
  }
}
