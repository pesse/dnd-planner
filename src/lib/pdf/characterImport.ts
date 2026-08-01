/**
 * Charakter-Import aus Taendler-PDFs. Zentral, damit Sidebar (Erstanlage beim Öffnen)
 * und CharacterSheet (manueller „PDF importieren"-Button) dieselbe Logik nutzen.
 *
 * PDF ist reine Import-Quelle: einmal eingelesen, wird daraus eine character.json,
 * die danach die alleinige Datenquelle des Editors ist.
 */
import { invoke } from '@tauri-apps/api/core';
import { parseCharacterData, type CharacterData, type CharacterJSON } from './characterFields';
import { readPdfFields } from './characterPdfIo';

/** Parst ein PDF-Feld-Set in unsere CharacterData. */
export function characterFromPdfFields(fields: Record<string, string>): CharacterData {
  return parseCharacterData(fields);
}

/**
 * Stellt sicher, dass im Charakter-Ordner eine `character.json` existiert. Fehlt sie,
 * wird sie einmalig aus einer vorhandenen PDF angelegt. Liefert true, wenn danach eine
 * JSON vorhanden ist (oder bereits war), sonst false (weder JSON noch PDF gefunden).
 */
export async function ensureCharacterJson(dirPath: string): Promise<boolean> {
  try {
    await invoke<string>('read_file_content', { path: `${dirPath}/character.json` });
    return true;
  } catch {
    /* keine JSON → ggf. aus PDF anlegen */
  }
  const pdfName = await invoke<string | null>('find_pdf_in_dir', { path: dirPath });
  if (!pdfName) return false;

  const data = characterFromPdfFields(await readPdfFields(`${dirPath}/${pdfName}`));
  const json: CharacterJSON = {
    ...data,
    // BEWUSST v1: PDF-Felder sind Freitext (Klasse/Volk/Hintergrund). Die
    // Upgrade-Pipeline (schemas/character.ts) strukturiert sie beim ersten Laden.
    _version: 1,
    _importedFrom: pdfName,
    _importedAt: new Date().toISOString(),
  };
  await invoke('write_file_content', { path: `${dirPath}/character.json`, content: JSON.stringify(json, null, 2) });
  return true;
}
