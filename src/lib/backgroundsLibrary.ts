/** Lese-Index der Hintergrund-Bibliothek (flach). */
import { createLibrary } from './services/library/createLibrary';
import { parseBackground } from './utils/schemaValidation';
import type { Background } from './schemas/background';

export const BACKGROUNDS_PATH = './vault/backgrounds';

export interface BackgroundInfo {
  name: string;
  nameDe?: string;
  path: string;
  /** Bibliotheks-Key des Hintergrunds, z.B. "srd-2024_soldier" oder "phb-2024_…". */
  key?: string;
}

export function backgroundDisplayName(info: BackgroundInfo): string {
  return info.nameDe ?? info.name;
}

const library = createLibrary<BackgroundInfo>({
  path: BACKGROUNDS_PATH,
  displayName: backgroundDisplayName,
  key: (b) => b.key,
  read: (data, { path, filename }) => ({
    name: data.name ?? filename.replace('.json', ''),
    nameDe: data.nameDe,
    path,
    key: data.key,
  }),
});

export const getBackgroundsList = library.list;
export const invalidateBackgroundsCache = library.invalidate;
export const searchBackgrounds = library.search;

/** Der volle Hintergrund (inkl. Vorteile) per Key; null = nicht lokal vorhanden/unparsebar. */
export function getBackgroundByKey(key: string): Promise<Background | null> {
  return library.loadByKey(key, (data) => {
    const r = parseBackground(data);
    return r.ok ? r.data : null;
  });
}
