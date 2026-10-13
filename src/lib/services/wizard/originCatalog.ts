/** Die vollständigen Einträge für die Herkunfts-Schritte — Raster und Detailansicht lesen sie. */
import type { Background, ClassProgression, Species } from '$lib/types';
import { getClassTree } from '$lib/classLibrary';
import { getSpeciesList, getSpeciesByKey } from '$lib/speciesLibrary';
import { getBackgroundsList, getBackgroundByKey } from '$lib/backgroundsLibrary';
import { getProgressionByKey } from '../classProgression';

export type OriginKind = 'class' | 'background' | 'species';

export interface OriginCatalog {
  classes: ClassProgression[];
  species: Species[];
  backgrounds: Background[];
}

const byNameDe = <T extends { name: string; nameDe?: string }>(a: T, b: T): number =>
  (a.nameDe || a.name).localeCompare(b.nameDe || b.name, 'de');

async function loadAll<T>(keys: (string | undefined)[], load: (key: string) => Promise<T | null>): Promise<T[]> {
  const entries: (T | null)[] = await Promise.all(
    keys.filter((k): k is string => !!k).map((k) => load(k).catch(() => null)),
  );
  return entries.filter((e): e is T => e !== null);
}

export async function loadOriginCatalog(): Promise<OriginCatalog> {
  const [tree, speciesList, backgroundList] = await Promise.all([getClassTree(), getSpeciesList(), getBackgroundsList()]);
  // Nur Grundklassen — die Unterklasse fällt erst ab Stufe 3 an.
  const [classes, species, backgrounds] = await Promise.all([
    loadAll(tree.filter((n) => !n.subclassOf).map((n) => n.key), getProgressionByKey),
    loadAll(speciesList.map((s) => s.key), getSpeciesByKey),
    loadAll(backgroundList.map((b) => b.key), getBackgroundByKey),
  ]);
  return { classes: classes.sort(byNameDe), species: species.sort(byNameDe), backgrounds: backgrounds.sort(byNameDe) };
}
