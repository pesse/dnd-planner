/** Kartendatei lesen/schreiben und das Kartenbild neben sie in den Vault kopieren. */
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import { battleMapSchema, type BattleMap } from '../../schemas/battleMap';
import { liftLegacyLights } from './legacyLights';
import { BASE_LEVEL, levelImageBase } from './levels';

export const MAP_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'avif'];

const dirOf = (path: string): string => path.slice(0, path.lastIndexOf('/'));
const baseNameOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1).replace(/\.json$/, '');

export const newBattleMap = (name: string): BattleMap => battleMapSchema.parse({ name });

export async function loadBattleMap(path: string): Promise<BattleMap> {
  const raw = await invoke<string>('read_file_content', { path });
  return battleMapSchema.parse(liftLegacyLights(JSON.parse(raw)));
}

export const serializeBattleMap = (map: BattleMap): string => JSON.stringify(map, null, 2);

/** `?v=` erzwingt frische Bytes, wenn ein Bild unter demselben Namen ersetzt wurde. */
export async function vaultFileUrl(path: string): Promise<string> {
  try {
    const abs = await invoke<string>('get_absolute_path', { path });
    return `${convertFileSrc(abs)}?v=${Date.now()}`;
  } catch {
    return '';
  }
}

export const mapImageUrl = (mapPath: string, image: string): Promise<string> =>
  image ? vaultFileUrl(`${dirOf(mapPath)}/${image}`) : Promise.resolve('');

/** Natürliche Größe eines Bilds; 0 × 0, wenn es nicht lädt. */
export function measureImage(url: string): Promise<{ w: number; h: number }> {
  if (!url) return Promise.resolve({ w: 0, h: 0 });
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 0, h: 0 });
    img.src = url;
  });
}

/**
 * Fragt nach einer Bilddatei und legt sie neben die Karte.
 * @returns der Dateiname für das `image` der Ebene, oder null bei Abbruch.
 */
export async function pickMapImage(mapPath: string, level = BASE_LEVEL): Promise<string | null> {
  const selected = await openFileDialog({ multiple: false, filters: [{ name: 'Bilder', extensions: MAP_IMAGE_EXTENSIONS }] });
  const src = Array.isArray(selected) ? selected[0] : selected;
  if (!src) return null;
  const data = await invoke<string>('read_file_base64', { path: src });
  return writeMapImage(mapPath, level, data, (src.split('.').pop() ?? 'png').toLowerCase());
}

/** Legt Base64-Bilddaten neben die Karte (Name nach `levelImageBase`) und gibt den Dateinamen zurück. */
export async function writeMapImage(mapPath: string, level: string, data: string, ext: string): Promise<string> {
  const file = `${levelImageBase(baseNameOf(mapPath), level)}.${ext}`;
  await invoke('write_file_base64', { path: `${dirOf(mapPath)}/${file}`, data });
  return file;
}
