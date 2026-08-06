/**
 * PDF-Ein-/Ausgabe für Charakterbögen: Dateiwahl, Bytes, Formularfelder, Export.
 * Die fachliche Deutung der Felder liegt in `characterFields`/`characterImport`.
 */
import { invoke } from '@tauri-apps/api/core';
import { open as openFileDialog, save as saveFileDialog } from '@tauri-apps/plugin-dialog';
import { PDFDocument } from 'pdf-lib';
import { exportCharacterToPdf } from './characterExport';
import { parseCharacterData, type CharacterData, type CharacterJSON } from './characterFields';
import type { SpellAccessValues } from '../services/spellcasting/access';

const TEMPLATE_PATH = './vault/templates/ataendler_v2.8.2.pdf';

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
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

/** Checkboxen kommen als „On"/„Off" heraus, damit alle Felder eine String-Map bilden. */
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

/**
 * Importiert einen Bogen in einen BESTEHENDEN Charakter: schreibt `character.json` neu und
 * gibt den geschriebenen Inhalt zurück. Die Zauber bleiben erhalten — sie werden manuell
 * gepflegt und stehen so im PDF nicht.
 */
export async function importPdfIntoCharacter(
  pdfPath: string,
  dirPath: string,
  keepSpells: CharacterData['spells'],
): Promise<string> {
  const imported = parseCharacterData(await readPdfFields(pdfPath));
  imported.spells = keepSpells;

  const json: CharacterJSON = {
    ...imported,
    // BEWUSST v1: PDF-Felder sind Freitext (Klasse/Volk/Hintergrund). Die
    // Upgrade-Pipeline (schemas/characterUpgrades.ts) strukturiert sie beim ersten Laden.
    _version: 1,
    _importedFrom: pdfPath.split(/[/\\]/).pop() ?? '',
    _importedAt: new Date().toISOString(),
  };
  const content = JSON.stringify(json, null, 2);
  await invoke('write_file_content', { path: `${dirPath}/character.json`, content });
  return content;
}

export interface CharacterPdfExport {
  /** Quelle der Import-Metadaten; leer = kein PDF-Ursprung. */
  importedFrom: string;
  /** Verzeichnis des Charakters — Fundort der Portraitdatei. */
  dirPath: string;
  freitext?: string;
  /** Angriffsname → deutscher Name der Meisterschaftseigenschaft (leer = nicht beherrscht). */
  masteryOf?: (attackName: string) => string | undefined;
  /** Zauberwerte der Merkmals-Zugänge — dieselben Zeilen, die die Karte zeigt. */
  spellAccess?: SpellAccessValues[];
  /** Flache Alt-Form aus `legacyFlatView`. */
  spells?: CharacterData['spells'];
}

/** Füllt das Taendler-Template und speichert es über die Zielwahl; false = abgebrochen. */
export async function exportCharacterPdfFile(
  character: CharacterData,
  opts: CharacterPdfExport,
): Promise<boolean> {
  const templateB64 = await invoke<string>('read_file_base64', { path: TEMPLATE_PATH });
  const templateBytes = base64ToBytes(templateB64);
  const json = {
    _version: 1 as const,
    _importedFrom: opts.importedFrom || undefined,
    _importedAt: new Date().toISOString(),
    ...character,
  };

  let portrait: { bytes: Uint8Array; format: 'png' | 'jpg' } | undefined;
  if (character.portraitFile) {
    try {
      const portraitB64 = await invoke<string>('read_file_base64', {
        path: `${opts.dirPath}/${character.portraitFile}`,
      });
      portrait = {
        bytes: base64ToBytes(portraitB64),
        format: character.portraitFile.toLowerCase().endsWith('.png') ? 'png' : 'jpg',
      };
    } catch { /* Portrait nicht ladbar → ohne weitermachen */ }
  }

  const pdfBytes = await exportCharacterToPdf(json, templateBytes, {
    portrait,
    freitext: opts.freitext,
    masteryOf: opts.masteryOf,
    spellAccess: opts.spellAccess,
    spells: opts.spells,
  });
  const b64 = bytesToBase64(pdfBytes);
  const safeName = character.name.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, '_') || 'charakter';
  const target = await saveFileDialog({
    defaultPath: `${safeName}-export.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (!target) return false;
  await invoke('write_file_base64', { path: target, data: b64 });
  return true;
}
