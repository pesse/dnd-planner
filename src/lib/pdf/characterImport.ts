/**
 * Charakter-Import aus Taendler-PDFs. Zentral, damit Sidebar (Erstanlage beim Öffnen)
 * und CharacterSheet (manueller „PDF importieren"-Button) dieselbe Logik nutzen.
 *
 * PDF ist reine Import-Quelle: einmal eingelesen, wird daraus eine character.json,
 * die danach die alleinige Datenquelle des Editors ist.
 */
import { invoke } from '@tauri-apps/api/core';
import { PDFDocument } from 'pdf-lib';
import { parseCharacterData, type CharacterData, type CharacterJSON } from './characterFields';

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Liest alle Formularfelder eines PDFs (Text + Checkboxen) als String-Map. */
export async function readPdfFields(absPdfPath: string): Promise<Record<string, string>> {
  const base64 = await invoke<string>('read_file_base64', { path: absPdfPath });
  const pdf = await PDFDocument.load(base64ToBytes(base64), { ignoreEncryption: true });
  const form = pdf.getForm();
  const fields: Record<string, string> = {};
  for (const field of form.getFields()) {
    const name = field.getName();
    try {
      fields[name] = form.getTextField(name).getText() ?? '';
    } catch {
      try {
        fields[name] = form.getCheckBox(name).isChecked() ? 'On' : 'Off';
      } catch {
        fields[name] = '';
      }
    }
  }
  return fields;
}

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
    _version: 1,
    _importedFrom: pdfName,
    _importedAt: new Date().toISOString(),
  };
  await invoke('write_file_content', { path: `${dirPath}/character.json`, content: JSON.stringify(json, null, 2) });
  return true;
}
