/**
 * Anlage von Charakteren: leerer Bogen, Wizard-Ergebnis, PDF-Import. Liefert je
 * Weg den Verzeichnis-Slug zurück; das Öffnen bleibt Sache des Aufrufers.
 */
import { invoke } from '@tauri-apps/api/core';
import { characterSchema, type Character } from '../schemas/characterSchema';
import type { CharacterJSON } from '../pdf/characterFields';
import { characterFromPdfFields } from '../pdf/characterImport';
import { choosePdfFile, readPdfFields } from '../pdf/characterPdfIo';
import { slugKeepUmlauts } from '../utils/text';

export const CHARACTERS_PATH = './vault/characters';

export type PdfImportResult =
  | { status: 'ok'; slug: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

const gmNotesTemplate = (name: string): string =>
  `# GM-Notizen: ${name}\n\n## Hintergrund\n\n## Geheimnisse & Hooks\n\n## Verbindungen\n\n## Entwicklung\n\n## DM-Notizen\n`;

async function writeCharacter(slug: string, notesName: string, json: CharacterJSON): Promise<void> {
  const dirPath = `${CHARACTERS_PATH}/${slug}`;
  await invoke('write_file_content', { path: `${dirPath}/character.json`, content: JSON.stringify(json, null, 2) });
  await invoke('write_file_content', { path: `${dirPath}/gm-notes.md`, content: gmNotesTemplate(notesName) });
}

/** Leerer Charakter aus einem eingetippten Namen; null = leere Eingabe oder Schreibfehler. */
export async function createBlankCharacter(rawName: string): Promise<string | null> {
  const raw = rawName.trim();
  if (!raw) return null;
  const slug = slugKeepUmlauts(raw, '_');
  const name = raw.charAt(0).toUpperCase() + raw.slice(1);
  try {
    await writeCharacter(slug, name, characterSchema.parse({ name }));
    return slug;
  } catch (err) {
    console.error('Charakter konnte nicht erstellt werden:', err);
    return null;
  }
}

/** Übernimmt den vom Wizard fertig zusammengesetzten Charakter. */
export async function createWizardCharacter(character: Character): Promise<string | null> {
  const raw = (character.name || 'Neuer Charakter').trim();
  const slug = slugKeepUmlauts(raw, '_') || 'charakter';
  try {
    await writeCharacter(slug, raw, character);
    return slug;
  } catch (err) {
    console.error('Charakter konnte nicht erstellt werden:', err);
    return null;
  }
}

/**
 * Dateiauswahl + Import eines Taendler-Bogens als neuer Charakter. `onPicked` meldet
 * den Beginn des eigentlichen Imports — die Dateiauswahl davor zählt nicht als Arbeit.
 */
export async function importCharacterFromPdf(onPicked?: () => void): Promise<PdfImportResult> {
  let path: string;
  try {
    const selected = await choosePdfFile(CHARACTERS_PATH);
    if (!selected) return { status: 'cancelled' };
    path = selected;
  } catch (e) {
    return { status: 'error', message: `Dateiauswahl fehlgeschlagen: ${e}` };
  }

  onPicked?.();
  try {
    const data = characterFromPdfFields(await readPdfFields(path));

    const charName = data.name || path.split(/[/\\]/).pop()?.replace(/\.pdf$/i, '') || 'unbekannt';
    const slug = slugKeepUmlauts(charName, '_');
    const json: CharacterJSON = {
      ...data, // _version: 1 kommt aus parseCharacterData — frisches PDF ist unstrukturiert.
      _importedFrom: path.split(/[/\\]/).pop() ?? path,
      _importedAt: new Date().toISOString(),
    };
    await invoke('write_file_content', {
      path: `${CHARACTERS_PATH}/${slug}/character.json`,
      content: JSON.stringify(json, null, 2),
    });
    return { status: 'ok', slug };
  } catch (e) {
    return { status: 'error', message: `Import fehlgeschlagen: ${e}` };
  }
}
