/**
 * Leichtes Feats-Wörterbuch aus `vault/feats/*.json` (Variante B: KEINE Sidebar-
 * Sammlung, nur inline aus dem Charakter-Referenzen-Toggle befüllt/gelesen).
 *
 * Datei-Form: `{ name, nameDe?, desc?, descDe?, sourceKey? }`. Folder-Scan wie
 * `itemLibrary.ts`; Suche auf `nameDe ?? name`. `list_json_files` liefert `[]` bei
 * fehlendem Ordner → keine Fehler, wenn das Wörterbuch noch leer ist.
 */
import { invoke } from '@tauri-apps/api/core';
import { slugify } from './editor/saveAs';
import { proficiencyGrantSchema, type ProficiencyGrant } from './schemas/shared';

export const FEATS_PATH = './vault/feats';

export interface FeatEntry {
  name: string;
  nameDe?: string;
  desc?: string;
  descDe?: string;
  /** Open5e-Key des Talents (identisch zur Charakter-Referenz `sourceKey`). */
  sourceKey?: string;
  /** Übungen, die das Talent gewährt (siehe schemas/feat.ts); fehlt bei inline erzeugten. */
  proficiencyGrant?: ProficiencyGrant;
  /** Vault-Pfad der Datei (für die Sidebar-Bibliothek); bei inline erzeugten leer. */
  path?: string;
}

/** Zeigt den deutschen Namen, falls vorhanden, sonst den Originalnamen. */
export function featDisplayName(f: FeatEntry): string {
  return f.nameDe ?? f.name;
}

/** Beste verfügbare Beschreibung: deutsch zuerst, dann Englisch. */
export function featDesc(f: FeatEntry): string {
  return f.descDe || f.desc || '';
}

// Singleton-Cache
let cache: FeatEntry[] | null = null;

export function invalidateFeatsCache(): void {
  cache = null;
}

/** Lädt alle Feats des Wörterbuchs (mit Cache). */
export async function getFeats(): Promise<FeatEntry[]> {
  if (cache) return cache;
  try {
    const files = await invoke<string[]>('list_json_files', { path: FEATS_PATH });
    const feats = await Promise.all(
      files.map(async (filename) => {
        const path = `${FEATS_PATH}/${filename}`;
        try {
          const content = await invoke<string>('read_file_content', { path });
          const data = JSON.parse(content);
          return {
            name: data.name ?? filename.replace('.json', ''),
            nameDe: data.nameDe,
            desc: data.desc,
            descDe: data.descDe,
            // Bibliotheks-Talente führen ihre Identität als `key`; inline gespeicherte als `sourceKey`.
            sourceKey: data.sourceKey ?? data.key,
            // Nur bei Bibliotheks-Talenten vorhanden; inline gespeicherte tragen keinen Grant.
            proficiencyGrant: proficiencyGrantSchema.safeParse(data.proficiencyGrant).data,
            path,
          } as FeatEntry;
        } catch {
          return { name: filename.replace('.json', ''), path } as FeatEntry;
        }
      })
    );
    feats.sort((a, b) => featDisplayName(a).localeCompare(featDisplayName(b), 'de'));
    cache = feats;
    return feats;
  } catch {
    cache = [];
    return [];
  }
}

/** Sucht Feats nach Name (deutsch zuerst, dann Original als Fallback). */
export function searchFeats(library: FeatEntry[], query: string, maxResults = 8): FeatEntry[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const results = library.filter((f) => {
    const primary = featDisplayName(f).toLowerCase();
    return primary.includes(q) || f.name.toLowerCase().includes(q);
  });
  results.sort((a, b) => {
    const aName = featDisplayName(a).toLowerCase();
    const bName = featDisplayName(b).toLowerCase();
    const aStart = aName.startsWith(q);
    const bStart = bName.startsWith(q);
    if (aStart !== bStart) return aStart ? -1 : 1;
    return aName.localeCompare(bName, 'de');
  });
  return results.slice(0, maxResults);
}

/**
 * Legt/aktualisiert einen Feat-Eintrag im Wörterbuch an. Dateiname = Slug des
 * deutschen (sonst englischen) Namens. Invalidiert den Cache.
 */
export async function saveFeat(entry: FeatEntry): Promise<void> {
  const slug = slugify(entry.nameDe || entry.name || 'talent');
  const path = `${FEATS_PATH}/${slug}.json`;
  await invoke('write_file_content', { path, content: JSON.stringify(entry, null, 2) });
  invalidateFeatsCache();
}
