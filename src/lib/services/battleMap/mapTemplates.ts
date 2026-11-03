/** Kartenvorlagen einer Kampagne: eine Karte ohne Spielgeschehen unter `map-templates/`, und neue Karten daraus. */
import { invoke } from '@tauri-apps/api/core';
import type { BattleMap } from '../../schemas/battleMap';
import { serializeBattleMap } from './mapFiles';
import { campaignDirOf } from './tokenDetails';
import { freeName } from '../templates/templates';

export const MAP_TEMPLATES_SUBDIR = 'map-templates';

export const isMapTemplatePath = (path: string): boolean => path.includes(`/${MAP_TEMPLATES_SUBDIR}/`);

const dirOf = (path: string): string => path.slice(0, path.lastIndexOf('/'));
const baseOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1).replace(/\.json$/, '');

/** Spieler-Charaktere fliegen raus; Monster und Fallen stehen wieder versteckt und unverletzt bzw. scharf da, der Nebel ist zu. */
export const asMapTemplate = (map: BattleMap): BattleMap => ({
  ...map,
  tokens: map.tokens
    .filter((t) => t.kind !== 'character')
    .map((t) =>
      t.kind === 'monster'
        ? { ...t, hp: t.hpMax, conditions: [], effects: [], initiative: null, hidden: true }
        : t.kind === 'trap'
          ? { ...t, trapState: 'armed' as const, hidden: true }
          : { ...t, conditions: [], effects: [], initiative: null },
    ),
  fog: { ...map.fog, ops: [] },
  combat: { round: 0, turn: '' },
});

/** Das Bild zieht mit und heißt wie die neue Datei, damit zwei Vorlagen sich kein Bild überschreiben. */
async function writeMapCopy(srcPath: string, map: BattleMap, targetDir: string, base: string): Promise<string> {
  let image = '';
  if (map.image) {
    image = `${base}.${map.image.split('.').pop()}`;
    const data = await invoke<string>('read_file_base64', { path: `${dirOf(srcPath)}/${map.image}` });
    await invoke('write_file_base64', { path: `${targetDir}/${image}`, data });
  }
  const path = `${targetDir}/${base}.json`;
  await invoke('write_file_content', { path, content: serializeBattleMap({ ...map, image }) });
  return path;
}

/** Ein zweites Speichern derselben Karte ersetzt ihre Vorlage. */
export const saveAsMapTemplate = (mapPath: string, map: BattleMap): Promise<string> =>
  writeMapCopy(mapPath, asMapTemplate(map), `${campaignDirOf(mapPath)}/${MAP_TEMPLATES_SUBDIR}`, baseOf(mapPath));

export async function mapFromTemplate(templatePath: string, map: BattleMap): Promise<string> {
  const dir = `${campaignDirOf(templatePath)}/maps`;
  const taken = await invoke<string[]>('list_json_files', { path: dir }).catch(() => [] as string[]);
  return writeMapCopy(templatePath, map, dir, freeName(baseOf(templatePath), new Set(taken.map(baseOf))));
}
