/**
 * Charakter-Import aus Taendler-PDFs. Das PDF ist reine Import-QUELLE: einmal eingelesen,
 * ist die entstandene `character.json` die alleinige Datenquelle des Editors.
 */
import { invoke } from '@tauri-apps/api/core';
import { parseCharacterData, type CharacterData, type CharacterJSON } from './characterFields';
import { readPdfFields } from './characterPdfIo';

export function characterFromPdfFields(fields: Record<string, string>): CharacterData {
  return parseCharacterData(fields);
}

/**
 * Legt die `character.json` einmalig aus einer vorhandenen PDF an, falls sie fehlt.
 * false = weder JSON noch PDF gefunden.
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
    // Upgrade-Pipeline (schemas/characterUpgrades.ts) strukturiert sie beim ersten Laden.
    _version: 1,
    _importedFrom: pdfName,
    _importedAt: new Date().toISOString(),
  };
  await invoke('write_file_content', { path: `${dirPath}/character.json`, content: JSON.stringify(json, null, 2) });
  return true;
}
