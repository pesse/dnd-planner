/**
 * Leichter Lese-Index der Talent-Bibliothek (`vault/feats/*.json`) für Suche und
 * Auflösung von Charakter-Links. Geschrieben wird ausschließlich über den Talent-
 * Karten-Editor — ein Charakter kann nur auf vorhandene Talente verlinken.
 *
 * Datei-Form: `{ name, nameDe?, desc?, descDe?, sourceKey? }`. Folder-Scan wie
 * `itemLibrary.ts`; Suche auf `nameDe ?? name`. `list_json_files` liefert `[]` bei
 * fehlendem Ordner → keine Fehler, wenn die Bibliothek noch leer ist.
 */
import { invoke } from '@tauri-apps/api/core';
import {
  FEAT_CATEGORIES,
  featureChoiceGrantSchema,
  featureGrantSchema,
  proficiencyGrantSchema,
  type FeatCategory,
  type FeatureChoiceGrant,
  type FeatureGrant,
  type ProficiencyGrant,
} from './schemas/shared';

export const FEATS_PATH = './vault/feats';

/**
 * Deutsche Anzeige-Labels der vier Talent-Kategorien. Das Vokabular selbst steht in
 * `schemas/shared.ts` (FEAT_CATEGORIES), damit Zod ohne Umweg über die Anzeige-Schicht
 * darauf zugreifen kann — analog zu `MASTERY_INFO` in `itemLibrary.ts`.
 */
export const FEAT_CATEGORY_DE: Record<FeatCategory, string> = {
  Origin: 'Ursprung',
  General: 'Allgemein',
  'Fighting Style': 'Kampfstil',
  'Epic Boon': 'Epischer Segen',
};

export interface FeatEntry {
  name: string;
  nameDe?: string;
  desc?: string;
  descDe?: string;
  /** Voraussetzung als Prosa (für Hover-Karte & Anzeige); fehlt bei inline erzeugten. */
  prerequisite?: string;
  prerequisiteDe?: string;
  /** Talent-Kategorie (5e 2024); fehlt bei inline erzeugten. */
  category?: FeatCategory;
  /** Open5e-Key des Talents (identisch zur Charakter-Referenz `sourceKey`). */
  sourceKey?: string;
  /** Übungen, die das Talent gewährt (siehe schemas/feat.ts); fehlt bei inline erzeugten. */
  proficiencyGrant?: ProficiencyGrant;
  /**
   * Mechanik-gebundene Wahl des Talents („Magiekundiger": `kind: "spellAccess"`). Der Flow
   * fragt sie deterministisch ab; nur Bibliotheks-Talente können sie tragen.
   */
  grantsChoice?: FeatureChoiceGrant;
  /**
   * Deterministisch anwendbare Mechanik („Zäh": +2 TP je Stufe). Fehlt = nicht redigiert,
   * `{}` = geprüft und ohne Mechanik (siehe `featureGrantSchema`).
   */
  grants?: FeatureGrant;
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

/** Beste verfügbare Voraussetzung: deutsch zuerst, dann Englisch. */
export function featPrereq(f: FeatEntry): string {
  return f.prerequisiteDe || f.prerequisite || '';
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
            prerequisite: data.prerequisite,
            prerequisiteDe: data.prerequisiteDe,
            category: (FEAT_CATEGORIES as readonly string[]).includes(data.category)
              ? (data.category as FeatCategory)
              : undefined,
            // Bibliotheks-Talente führen ihre Identität als `key`; inline gespeicherte als `sourceKey`.
            sourceKey: data.sourceKey ?? data.key,
            // Nur bei Bibliotheks-Talenten vorhanden; inline gespeicherte tragen keinen Grant.
            proficiencyGrant: proficiencyGrantSchema.safeParse(data.proficiencyGrant).data,
            grantsChoice: featureChoiceGrantSchema.safeParse(data.grantsChoice).data,
            grants: featureGrantSchema.safeParse(data.grants).data,
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
 * Bibliotheks-Treffer für eine Charakter-Referenz: `sourceKey` zuerst, Name (DE oder EN)
 * als Fallback für Altdaten ohne Key. Einzige Stelle dieser Regel — `resolveFeatLinks`
 * und der Talent-Picker im Charakter-Editor müssen dasselbe „verlinkt" verstehen.
 */
export function matchFeatEntry(
  library: FeatEntry[],
  ref: { sourceKey?: string; name?: string },
): FeatEntry | undefined {
  const key = ref.sourceKey?.trim();
  const nm = (ref.name ?? '').trim().toLowerCase();
  return library.find(
    (f) => (!!key && f.sourceKey === key) || (!!nm && (featDisplayName(f).toLowerCase() === nm || f.name.toLowerCase() === nm)),
  );
}
