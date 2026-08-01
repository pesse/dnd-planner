/**
 * Rohe PDF-Ein-/Ausgabe für Charakterbögen: Dateiwahl, Bytes, Formularfelder.
 * Die fachliche Deutung der Felder liegt in `characterFields`/`characterImport`.
 */
import { invoke } from '@tauri-apps/api/core';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import { PDFDocument } from 'pdf-lib';

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Öffnet die Dateiauswahl für einen Charakterbogen; null = abgebrochen. */
export async function choosePdfFile(defaultDir: string): Promise<string | null> {
  const defaultPath = await invoke<string>('get_absolute_path', { path: defaultDir }).catch(() => undefined);
  const selected = await openFileDialog({
    multiple: false,
    defaultPath,
    filters: [{ name: 'PDF Charakterbogen', extensions: ['pdf'] }],
  });
  return (selected as string | null) ?? null;
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
