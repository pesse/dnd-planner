/**
 * Lädt und cached den Spezies-Bibliotheks-Index aus `vault/species` (flach).
 * Analog zu `classLibrary.ts`. `list_json_files` liefert `[]` bei fehlendem
 * Ordner → keine Fehler, wenn die Bibliothek noch leer ist.
 */
import { invoke } from '@tauri-apps/api/core';
import type { FeatureRef } from './classLibrary';
import { speciesSchema, migrateSpeciesLegacy, type Species } from './schemas/species';

export const SPECIES_PATH = './vault/species';

export interface SpeciesInfo {
  name: string;
  nameDe?: string;
  path: string;
  /** Bibliotheks-Key der Spezies, z.B. "srd-2024_dwarf" oder "homebrew-sam_…". */
  key?: string;
}

/** Zeigt den deutschen Namen, falls vorhanden, sonst den Originalnamen. */
export function speciesDisplayName(info: SpeciesInfo): string {
  return info.nameDe ?? info.name;
}

// Singleton-Cache
let cache: SpeciesInfo[] | null = null;

// Trait-Index-Cache (name-flach über alle Spezies der Bibliothek).
let traitCache: FeatureRef[] | null = null;

export function invalidateSpeciesCache(): void {
  cache = null;
  traitCache = null;
}

/** Lädt alle Merkmale (Traits) aller Bibliotheks-Spezies (flach), für Referenz-Autocomplete. */
export async function getSpeciesTraits(): Promise<FeatureRef[]> {
  if (traitCache) return traitCache;
  const infos = await getSpeciesList();
  const out: FeatureRef[] = [];
  await Promise.all(
    infos.map(async (info) => {
      try {
        const data = JSON.parse(await invoke<string>('read_file_content', { path: info.path }));
        const key = data.key || info.name;
        for (const t of data.traits ?? []) {
          out.push({
            name: t.nameDe || t.name || '',
            nameEn: t.name || '',
            desc: t.desc || '',
            descDe: t.descDe,
            sourceKey: key,
          });
        }
      } catch { /* Datei überspringen */ }
    })
  );
  traitCache = out;
  return out;
}

/** Lädt alle Spezies der Bibliothek (mit Cache). */
export async function getSpeciesList(): Promise<SpeciesInfo[]> {
  if (cache) return cache;
  try {
    const files = await invoke<string[]>('list_json_files', { path: SPECIES_PATH });
    const species = await Promise.all(
      files.map(async (filename) => {
        const path = `${SPECIES_PATH}/${filename}`;
        try {
          const content = await invoke<string>('read_file_content', { path });
          const data = JSON.parse(content);
          return { name: data.name ?? filename.replace('.json', ''), nameDe: data.nameDe, path, key: data.key };
        } catch {
          return { name: filename.replace('.json', ''), path };
        }
      })
    );
    species.sort((a, b) => speciesDisplayName(a).localeCompare(speciesDisplayName(b), 'de'));
    cache = species;
    return species;
  } catch {
    cache = [];
    return [];
  }
}

/**
 * Lädt die volle Spezies (inkl. Traits) aus der lokalen Bibliothek per Key.
 * null = nicht lokal vorhanden / unparsebar. Analog zu `getProgressionByKey`.
 */
export async function getSpeciesByKey(key: string): Promise<Species | null> {
  if (!key) return null;
  try {
    const info = (await getSpeciesList()).find((s) => s.key === key);
    if (!info) return null;
    const data = JSON.parse(await invoke<string>('read_file_content', { path: info.path }));
    const r = speciesSchema.safeParse(migrateSpeciesLegacy(data));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/** Sucht Spezies nach Name (deutsch zuerst, dann Original als Fallback). */
export function searchSpecies(library: SpeciesInfo[], query: string, maxResults = 10): SpeciesInfo[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const results = library.filter((s) => {
    const primary = (s.nameDe ?? s.name).toLowerCase();
    return primary.includes(q) || s.name.toLowerCase().includes(q);
  });
  results.sort((a, b) => {
    const aName = speciesDisplayName(a).toLowerCase();
    const bName = speciesDisplayName(b).toLowerCase();
    const aStart = aName.startsWith(q);
    const bStart = bName.startsWith(q);
    if (aStart !== bStart) return aStart ? -1 : 1;
    return aName.localeCompare(bName, 'de');
  });
  return results.slice(0, maxResults);
}
