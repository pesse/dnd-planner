/** Was hinter einem Token steht: Encounter, Monster-Werte, Charakterdatei. Karten liegen unter `<kampagne>/maps/`. */
import { invoke } from '@tauri-apps/api/core';
import { encounterSchema, type Encounter } from '../../schemas/encounter';
import type { Token } from '../../schemas/battleMap';
import type { FileEntry, Monster } from '../../types';
import { CHARACTERS_PATH } from '../characterDirectory';
import { fetchEncounterMonsters } from '../contextLoad';

export const campaignDirOf = (mapPath: string): string => mapPath.replace(/\/maps\/[^/]+$/, '');

/** `<akt>/<encounter>` — derselbe Schlüssel wie in `encounterSummaries`, unabhängig vom Kampagnenordner. */
export const encounterPath = (campaignDir: string, key: string): string => {
  const [act, slug] = key.split('/');
  return `${campaignDir}/acts/${act}/encounters/${slug}.json`;
};

export const encounterKeyOf = (path: string): string => {
  const m = /\/acts\/([^/]+)\/encounters\/([^/]+)\.json$/.exec(path);
  return m ? `${m[1]}/${m[2]}` : '';
};

export async function loadEncounter(path: string): Promise<Encounter | null> {
  try {
    return encounterSchema.parse(JSON.parse(await invoke<string>('read_file_content', { path })));
  } catch {
    return null;
  }
}

/** Akt-lokale Werte schlagen die Bibliothek, sobald das Token zu einem Encounter gehört. */
export async function loadTokenMonster(token: Pick<Token, 'ref' | 'encounter'>, campaignDir: string): Promise<Monster | null> {
  const enc = token.encounter ? encounterPath(campaignDir, token.encounter) : undefined;
  const [monster] = await fetchEncounterMonsters(JSON.stringify({ monsters: [{ slug: token.ref }] }), enc);
  return monster ?? null;
}

export const characterEntry = (uid: string, name: string): FileEntry => ({
  name,
  type: 'character',
  path: `${CHARACTERS_PATH}/${uid}/character.json`,
  dirPath: `${CHARACTERS_PATH}/${uid}`,
});

/** Neue TP nach Schaden (negativ) oder Heilung, zwischen 0 und Maximum. Ohne gezählte TP gilt `fallbackMax` als voll. */
export function adjustHp(token: Pick<Token, 'hp' | 'hpMax'>, fallbackMax: number, delta: number): Pick<Token, 'hp' | 'hpMax'> {
  const hpMax = token.hpMax ?? fallbackMax;
  const hp = Math.max(0, Math.min(hpMax, (token.hp ?? hpMax) + delta));
  return { hp, hpMax };
}
