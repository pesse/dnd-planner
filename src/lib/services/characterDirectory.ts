/**
 * Charakterordner im Vault auflisten. Der Ordnername ist die Identität (eine UID),
 * der Anzeigename steht in der `character.json` — jede Liste, die Charaktere zur
 * Auswahl stellt, muss deshalb hier durch und darf nie den Ordnernamen zeigen.
 */
import { invoke } from '@tauri-apps/api/core';
import { newUid } from '../utils/uid';

export const CHARACTERS_PATH = './vault/characters';

export interface CharacterRef {
  uid: string;
  name: string;
  classLevel: string;
}

interface EntryInfo {
  name: string;
  is_dir: boolean;
}

/** Nur die Ordnernamen — für Identitätsfragen, die den Inhalt nicht brauchen. */
export async function listCharacterDirs(): Promise<string[]> {
  try {
    const entries = await invoke<EntryInfo[]>('list_entries', { path: CHARACTERS_PATH });
    return entries.filter((e) => e.is_dir).map((e) => e.name);
  } catch {
    return [];
  }
}

/** Eine UID, die im Vault noch nicht vergeben ist. */
export async function freshCharacterUid(): Promise<string> {
  const taken = new Set(await listCharacterDirs());
  let uid = newUid();
  while (taken.has(uid)) uid = newUid();
  return uid;
}

/** Anzeigename eines einzelnen Charakters; leer, wenn die Datei fehlt oder kaputt ist. */
export async function readCharacterName(uid: string): Promise<string> {
  try {
    const raw = await invoke<string>('read_file_content', {
      path: `${CHARACTERS_PATH}/${uid}/character.json`,
    });
    return (JSON.parse(raw).name as string | undefined)?.trim() ?? '';
  } catch {
    return '';
  }
}

/** Alle Charaktere mit Anzeigedaten, nach Namen sortiert. */
export async function listCharacterRefs(): Promise<CharacterRef[]> {
  const dirs = await listCharacterDirs();
  const refs = await Promise.all(
    dirs.map(async (uid): Promise<CharacterRef> => {
      try {
        const raw = await invoke<string>('read_file_content', {
          path: `${CHARACTERS_PATH}/${uid}/character.json`,
        });
        const data = JSON.parse(raw);
        return {
          uid,
          name: (data.name as string | undefined)?.trim() || '',
          classLevel: (data.classLevel as string | undefined)?.trim() || '',
        };
      } catch {
        return { uid, name: '', classLevel: '' };
      }
    })
  );
  return refs.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** Was in der Oberfläche steht, wenn die `character.json` keinen Namen hergibt. */
export function characterLabel(ref: { uid: string; name: string }): string {
  return ref.name || 'Unbenannter Charakter';
}
