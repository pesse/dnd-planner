/** Kartenvorlagen einer Kampagne: eine Karte ohne Spielgeschehen unter `map-templates/`, und neue Karten daraus. */
import { invoke } from '@tauri-apps/api/core';
import type { BattleMap } from '../../schemas/battleMap';
import { serializeBattleMap } from './mapFiles';
import { confirmAction } from '../../stores/confirmDialog';
import { openSaveAs } from '../../editor/saveAs';
import { slugKeepUmlauts } from '../../utils/text';
import type { Campaign } from '../../types';
import { campaignDirOf } from './tokenDetails';
import { copyMapEncounters } from './mapEncounterCopy';

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

export interface MapPlacement {
  name: string;
  /** Ordnername der Kampagne unter `vault/campaigns`. */
  campaign: string;
}

const campaignDir = (campaign: string): string => `./vault/campaigns/${campaign}`;
const placeDir = (campaign: string, subdir: string): string => `${campaignDir(campaign)}/${subdir}`;

async function takenBases(dir: string): Promise<Set<string>> {
  const files = await invoke<string[]>('list_json_files', { path: dir }).catch(() => [] as string[]);
  return new Set(files.map(baseOf));
}

/** `rename_file` und `write_file_content` überschreiben stillschweigend — vorher fragen. */
async function mayReplace(dir: string, base: string, what: string): Promise<boolean> {
  if (!(await takenBases(dir)).has(base)) return true;
  return confirmAction({
    title: `${what} ersetzen?`,
    message: `Es gibt schon ${what === 'Karte' ? 'eine Karte' : 'eine Vorlage'} „${base}". Sie wird überschrieben.`,
    confirmLabel: 'Ersetzen',
    danger: true,
  });
}

/** Fragt Name und Ziel-Kampagne ab; null bei Abbruch. */
export async function askMapPlacement(title: string, name: string, campaign: string, campaigns: Campaign[]): Promise<MapPlacement | null> {
  const result = await openSaveAs({
    title,
    name,
    bucketLabel: 'Kampagne',
    buckets: campaigns.map((c) => ({ value: c.path, label: c.name })),
    bucket: campaign,
  });
  return result?.bucket ? { name: result.name, campaign: result.bucket } : null;
}

/** @returns der neue Pfad, oder null, wenn der Nutzer das Überschreiben abgelehnt hat. */
async function writePlaced(srcPath: string, map: BattleMap, to: MapPlacement, subdir: string, what: string): Promise<string | null> {
  const dir = placeDir(to.campaign, subdir);
  const base = slugKeepUmlauts(to.name);
  if (!base || !(await mayReplace(dir, base, what))) return null;
  await copyMapEncounters(map, campaignDirOf(srcPath), campaignDir(to.campaign));
  return writeMapCopy(srcPath, { ...map, name: to.name }, dir, base);
}

export const saveAsMapTemplate = (mapPath: string, map: BattleMap, to: MapPlacement): Promise<string | null> =>
  writePlaced(mapPath, asMapTemplate(map), to, MAP_TEMPLATES_SUBDIR, 'Vorlage');

export const mapFromTemplate = (templatePath: string, map: BattleMap, to: MapPlacement): Promise<string | null> =>
  writePlaced(templatePath, map, to, 'maps', 'Karte');

/** Datei und Bild heißen nach dem Namen; das Bild zieht nur mit, wenn es nach der Karte hieß. @returns der neue Pfad, oder null bei Abbruch. */
export async function renameMap(path: string, map: BattleMap, name: string): Promise<string | null> {
  const dir = dirOf(path);
  const oldBase = baseOf(path);
  const base = slugKeepUmlauts(name);
  if (!base) return null;
  if (base !== oldBase && !(await mayReplace(dir, base, isMapTemplatePath(path) ? 'Vorlage' : 'Karte'))) return null;
  let image = map.image;
  const ext = image.split('.').pop();
  if (base !== oldBase && image === `${oldBase}.${ext}`) {
    image = `${base}.${ext}`;
    await invoke('rename_file', { oldPath: `${dir}/${map.image}`, newPath: `${dir}/${image}` });
  }
  const newPath = `${dir}/${base}.json`;
  if (newPath !== path) await invoke('rename_file', { oldPath: path, newPath });
  await invoke('write_file_content', { path: newPath, content: serializeBattleMap({ ...map, name, image }) });
  return newPath;
}
