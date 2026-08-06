/**
 * PDF-Ausgabe für Charakterbögen: Bytes und Export. Die Feldbelegung liegt in
 * `characterExport`/`characterFields`. Einen Import gibt es nicht — Charaktere
 * entstehen im Wizard, das PDF ist reines Ausgabeformat.
 */
import { invoke } from '@tauri-apps/api/core';
import { save as saveFileDialog } from '@tauri-apps/plugin-dialog';
import { exportCharacterToPdf } from './characterExport';
import type { CharacterData } from './characterFields';
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

  const pdfBytes = await exportCharacterToPdf(character, templateBytes, {
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
