/** Kartenvorlagen einer Kampagne: eine Karte ohne Spielgeschehen unter `map-templates/`, und neue Karten daraus. */
import { invoke } from '@tauri-apps/api/core';
import type { BattleMap } from '../../schemas/battleMap';
import { serializeBattleMap } from './mapFiles';
import { confirmAction } from '../../stores/confirmDialog';
import { slugKeepUmlauts } from '../../utils/text';
import type { MapPlacement } from './mapPlacement';
import { campaignDirOf } from './tokenDetails';
import { copyMapEncounters } from './mapEncounterCopy';
import { levelImageBase, mapImageSlots, withLevelImage } from './levels';

export const MAP_TEMPLATES_SUBDIR = 'map-templates';

export const isMapTemplatePath = (path: string): boolean => path.includes(`/${MAP_TEMPLATES_SUBDIR}/`);

const dirOf = (path: string): string => path.slice(0, path.lastIndexOf('/'));
const baseOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1).replace(/\.json$/, '');

/** Spieler-Charaktere fliegen raus; Monster und Fallen stehen wieder versteckt und unverletzt bzw. scharf da, der Nebel ist zu. Eine Vorlage gehört keinem Akt. */
export const asMapTemplate = (map: BattleMap): BattleMap => ({
  ...map,
  acts: [],
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
  levels: map.levels.map((l) => ({ ...l, fog: { ...l.fog, ops: [] } })),
  combat: { round: 0, turn: '' },
});

const extOf = (file: string): string => file.split('.').pop() ?? '';

/** Die Bilder ziehen mit und heißen nach der neuen Datei, damit zwei Vorlagen sich kein Bild überschreiben. */
async function writeMapCopy(srcPath: string, map: BattleMap, targetDir: string, base: string): Promise<string> {
  let copy = map;
  for (const slot of mapImageSlots(map)) {
    const image = `${levelImageBase(base, slot.level)}.${extOf(slot.file)}`;
    const data = await invoke<string>('read_file_base64', { path: `${dirOf(srcPath)}/${slot.file}` });
    await invoke('write_file_base64', { path: `${targetDir}/${image}`, data });
    copy = withLevelImage(copy, slot.level, image);
  }
  const path = `${targetDir}/${base}.json`;
  await invoke('write_file_content', { path, content: serializeBattleMap(copy) });
  return path;
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

/** @returns der neue Pfad, oder null, wenn der Nutzer das Überschreiben abgelehnt hat. */
async function writePlaced(srcPath: string, map: BattleMap, to: MapPlacement, subdir: string, what: string): Promise<string | null> {
  const dir = placeDir(to.campaign, subdir);
  const base = slugKeepUmlauts(to.name);
  if (!base || !(await mayReplace(dir, base, what))) return null;
  const placed = await copyMapEncounters(map, campaignDirOf(srcPath), campaignDir(to.campaign), to.act);
  return writeMapCopy(srcPath, { ...placed, name: to.name, acts: to.act ? [to.act] : [] }, dir, base);
}

export const saveAsMapTemplate = (mapPath: string, map: BattleMap, to: MapPlacement): Promise<string | null> =>
  writePlaced(mapPath, asMapTemplate(map), to, MAP_TEMPLATES_SUBDIR, 'Vorlage');

export const mapFromTemplate = (templatePath: string, map: BattleMap, to: MapPlacement): Promise<string | null> =>
  writePlaced(templatePath, map, to, 'maps', 'Karte');

/** Datei und Bilder heißen nach dem Namen; ein Bild zieht nur mit, wenn es nach der Karte hieß. @returns der neue Pfad, oder null bei Abbruch. */
export async function renameMap(path: string, map: BattleMap, name: string): Promise<string | null> {
  const dir = dirOf(path);
  const oldBase = baseOf(path);
  const base = slugKeepUmlauts(name);
  if (!base) return null;
  if (base !== oldBase && !(await mayReplace(dir, base, isMapTemplatePath(path) ? 'Vorlage' : 'Karte'))) return null;
  let renamed = { ...map, name };
  for (const slot of base === oldBase ? [] : mapImageSlots(map)) {
    const ext = extOf(slot.file);
    if (slot.file !== `${levelImageBase(oldBase, slot.level)}.${ext}`) continue;
    const image = `${levelImageBase(base, slot.level)}.${ext}`;
    await invoke('rename_file', { oldPath: `${dir}/${slot.file}`, newPath: `${dir}/${image}` });
    renamed = withLevelImage(renamed, slot.level, image);
  }
  const newPath = `${dir}/${base}.json`;
  if (newPath !== path) await invoke('rename_file', { oldPath: path, newPath });
  await invoke('write_file_content', { path: newPath, content: serializeBattleMap(renamed) });
  return newPath;
}
