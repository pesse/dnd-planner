/** Lese-Index der Klassen-Bibliothek (flach) plus Subklassen-Baum. */
import { createLibrary } from './services/library/createLibrary';

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

export function classDisplayName(info: ClassInfo): string {
  return info.nameDe ?? info.name;
}

const library = createLibrary<ClassInfo>({
  path: CLASSES_PATH,
  displayName: classDisplayName,
  key: (c) => c.key,
  read: (data, { path, filename }) => ({
    name: data.name ?? filename.replace('.json', ''),
    nameDe: data.nameDe,
    path,
    key: data.key,
    subclassOf: data.subclassOf,
  }),
});

export const getClasses = library.list;
export const invalidateClassCache = library.invalidate;
export const searchClasses = library.search;
export const findClassByKey = library.loadByKey;

/**
 * Zweistufige Hierarchie über `subclassOf` ↔ `key`. Eine Subklasse ohne vorhandene
 * Basisklasse (fremder Parent, Bibliothek nicht installiert) wird eigenständiger
 * Top-Level-Eintrag, damit nichts aus der Ansicht verschwindet.
 */
export async function getClassTree(): Promise<ClassNode[]> {
  const infos = await getClasses();
  const byKey = new Map<string, ClassNode>();
  const roots: ClassNode[] = [];
  const orphans: ClassInfo[] = [];

  for (const info of infos) {
    if (info.subclassOf) continue;
    const node: ClassNode = { ...info, subclasses: [] };
    roots.push(node);
    if (info.key) byKey.set(info.key, node);
  }

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
