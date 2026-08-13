/** Lese-Index der Hintergrund-Bibliothek (flach). */
import { createLibrary } from './services/library/createLibrary';
import { memoByKey } from './services/library/memo';
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
  key: (b) => b.key,
});

const fullByKey = memoByKey((key: string) =>
  library.loadByKey(key, (data) => {
    const r = parseBackground(data);
    return r.ok ? r.data : null;
  }),
);

export const getBackgroundsList = library.list;
export const searchBackgrounds = library.search;
export const searchBackgroundDrafts = library.searchWithParser;

export function invalidateBackgroundsCache(): void {
  library.invalidate();
  fullByKey.invalidate();
}

/**
 * „Magic Initiate (Wizard)" → „Wizard": die Vorgabe, mit der der Hintergrund die Wahl seines
 * Herkunftstalents festlegt. ENGLISCH, weil der Wert Klassen-Keys trifft — „Magier" wäre genau
 * die Zauberer/Magier-Kollision. Im Talent-Wörterbuch steht nur die generische Fassung, hier
 * kommt sie also her oder von nirgends.
 */
export function featSpecialisation(bg: Background | null | undefined): string {
  const benefit = bg?.benefits.find((b) => b.type === 'feat');
  const raw = benefit?.desc || benefit?.descDe || '';
  return raw.match(/\(([^)]+)\)/)?.[1]?.trim() ?? '';
}

/** Der volle Hintergrund (inkl. Vorteile) per Key; null = nicht lokal vorhanden/unparsebar. */
export const getBackgroundByKey = fullByKey.get;
