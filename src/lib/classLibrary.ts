/**
 * Lädt und cached den Klassen-Bibliotheks-Index aus `vault/classes` (flach).
 * Muster von `itemLibrary.ts`, reines TS (kein Rust). `list_json_files` liefert
 * `[]` bei fehlendem Ordner → keine Fehler, wenn die Bibliothek noch leer ist.
 */
import { invoke } from '@tauri-apps/api/core';

export const CLASSES_PATH = './vault/classes';

export interface ClassInfo {
  name: string;
  nameDe?: string;
  path: string;
  /** Open5e-v2-Key der Klasse (z.B. "srd-2024_champion"). */
  key?: string;
  /** v2-Key der Basisklasse, falls dies eine Subklasse ist. */
  subclassOf?: string;
}

/** Eine Basisklasse mit ihren (nach Namen sortierten) Subklassen. */
export interface ClassNode extends ClassInfo {
  subclasses: ClassInfo[];
}

/** Zeigt den deutschen Namen, falls vorhanden, sonst den Originalnamen. */
export function classDisplayName(info: ClassInfo): string {
  return info.nameDe ?? info.name;
}

// Singleton-Cache
let cache: ClassInfo[] | null = null;

export function invalidateClassCache(): void {
  cache = null;
  featureCache = null;
}

/** Lädt alle Klassen der Bibliothek (mit Cache). */
export async function getClasses(): Promise<ClassInfo[]> {
  if (cache) return cache;
  try {
    const files = await invoke<string[]>('list_json_files', { path: CLASSES_PATH });
    const classes = await Promise.all(
      files.map(async (filename) => {
        const path = `${CLASSES_PATH}/${filename}`;
        try {
          const content = await invoke<string>('read_file_content', { path });
          const data = JSON.parse(content);
          return {
            name: data.name ?? filename.replace('.json', ''),
            nameDe: data.nameDe,
            path,
            key: data.key,
            subclassOf: data.subclassOf,
          };
        } catch {
          return { name: filename.replace('.json', ''), path };
        }
      })
    );
    classes.sort((a, b) => classDisplayName(a).localeCompare(classDisplayName(b), 'de'));
    cache = classes;
    return classes;
  } catch {
    cache = [];
    return [];
  }
}

/**
 * Baut aus der flachen Bibliothek eine zweistufige Hierarchie: Basisklassen mit
 * ihren Subklassen als Unterpunkte. Zuordnung über `subclassOf` (v2-Key der
 * Basisklasse) ↔ `key`. Subklassen ohne vorhandene Basisklasse (fremder/fehlender
 * Parent) erscheinen als eigenständige Top-Level-Einträge, damit nichts verschwindet.
 */
export async function getClassTree(): Promise<ClassNode[]> {
  const infos = await getClasses();
  const byKey = new Map<string, ClassNode>();
  const roots: ClassNode[] = [];
  const orphans: ClassInfo[] = [];

  // 1. Basisklassen (ohne subclassOf) als Knoten anlegen.
  for (const info of infos) {
    if (info.subclassOf) continue;
    const node: ClassNode = { ...info, subclasses: [] };
    roots.push(node);
    if (info.key) byKey.set(info.key, node);
  }

  // 2. Subklassen ihrer Basisklasse zuordnen (oder als Waise sammeln).
  for (const info of infos) {
    if (!info.subclassOf) continue;
    const parent = byKey.get(info.subclassOf);
    if (parent) parent.subclasses.push(info);
    else orphans.push(info);
  }

  const byName = (a: ClassInfo, b: ClassInfo) =>
    classDisplayName(a).localeCompare(classDisplayName(b), 'de');
  for (const node of roots) node.subclasses.sort(byName);
  for (const o of orphans) roots.push({ ...o, subclasses: [] });
  roots.sort(byName);
  return roots;
}

/**
 * Ein einzelnes Merkmal aus der Bibliothek, angereichert um den Quell-Key der
 * Klasse/Spezies — für Charakter-Referenz-Autocomplete (Feature-/Trait-Namen).
 */
export interface FeatureRef {
  name: string;      // Anzeige: nameDe || name
  nameEn: string;
  desc: string;      // EN
  descDe?: string;
  sourceKey: string; // Key der Eltern-Klasse/-Spezies
  gainedAt?: number;
}

// Feature-Index-Cache (name-flach über alle Klassen der Bibliothek).
let featureCache: FeatureRef[] | null = null;

export function invalidateClassFeatureCache(): void {
  featureCache = null;
}

/** Lädt alle Merkmale aller Bibliotheks-Klassen (flach), für Referenz-Autocomplete. */
export async function getClassFeatures(): Promise<FeatureRef[]> {
  if (featureCache) return featureCache;
  const infos = await getClasses();
  const out: FeatureRef[] = [];
  await Promise.all(
    infos.map(async (info) => {
      try {
        const data = JSON.parse(await invoke<string>('read_file_content', { path: info.path }));
        const key = data.key || info.name;
        for (const f of data.features ?? []) {
          out.push({
            name: f.nameDe || f.name || '',
            nameEn: f.name || '',
            desc: f.desc || '',
            descDe: f.descDe,
            sourceKey: key,
            gainedAt: Array.isArray(f.gainedAt) ? f.gainedAt[0] : undefined,
          });
        }
      } catch { /* Datei überspringen */ }
    })
  );
  featureCache = out;
  return out;
}

/** Sucht Klassen nach Name (deutsch zuerst, dann Original als Fallback). */
export function searchClasses(library: ClassInfo[], query: string, maxResults = 10): ClassInfo[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const results = library.filter((c) => {
    const primary = (c.nameDe ?? c.name).toLowerCase();
    return primary.includes(q) || c.name.toLowerCase().includes(q);
  });
  results.sort((a, b) => {
    const aName = classDisplayName(a).toLowerCase();
    const bName = classDisplayName(b).toLowerCase();
    const aStart = aName.startsWith(q);
    const bStart = bName.startsWith(q);
    if (aStart !== bStart) return aStart ? -1 : 1;
    return aName.localeCompare(bName, 'de');
  });
  return results.slice(0, maxResults);
}
