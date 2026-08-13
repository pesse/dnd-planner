/** Lese-Index der Spezies-Bibliothek (flach). */
import { createLibrary } from './services/library/createLibrary';
import { memoByKey } from './services/library/memo';
import { speciesSchema, migrateSpeciesLegacy, type Species } from './schemas/species';

export const SPECIES_PATH = './vault/species';

export interface SpeciesInfo {
  name: string;
  nameDe?: string;
  path: string;
  /** Bibliotheks-Key der Spezies, z.B. "srd-2024_dwarf" oder "homebrew-sam_…". */
  key?: string;
}

export function speciesDisplayName(info: SpeciesInfo): string {
  return info.nameDe ?? info.name;
}

const library = createLibrary<SpeciesInfo>({
  path: SPECIES_PATH,
  key: (s) => s.key,
});

const fullByKey = memoByKey((key: string) =>
  library.loadByKey(key, (data) => speciesSchema.safeParse(migrateSpeciesLegacy(data)).data ?? null),
);

export const getSpeciesList = library.list;
export const searchSpecies = library.search;
export const searchSpeciesDrafts = library.searchWithParser;

export function invalidateSpeciesCache(): void {
  library.invalidate();
  fullByKey.invalidate();
}

/** Die volle Spezies (inkl. Traits) per Key; null = nicht lokal vorhanden/unparsebar. */
export const getSpeciesByKey = fullByKey.get;
