/** Lese-Index der Spezies-Bibliothek (flach). */
import { createLibrary } from './services/library/createLibrary';
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

export const getSpeciesList = library.list;
export const invalidateSpeciesCache = library.invalidate;
export const searchSpecies = library.search;
export const searchSpeciesDrafts = library.searchWithParser;

/** Die volle Spezies (inkl. Traits) per Key; null = nicht lokal vorhanden/unparsebar. */
export function getSpeciesByKey(key: string): Promise<Species | null> {
  return library.loadByKey(key, (data) => speciesSchema.safeParse(migrateSpeciesLegacy(data)).data ?? null);
}
