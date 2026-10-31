/**
 * Key- und Namensindex über eine Bibliothek. Index statt linearer Suche: der Bogen
 * löst bis zu 55 Zeilen gegen ~1000 Einträge auf.
 */
import { normName } from '$lib/utils/text';

export interface NameIndex<T> {
  byKey: Map<string, T>;
  /** Kleingeschrieben, deutscher UND englischer Name — beide Schreibweisen kommen vor. */
  byName: Map<string, T>;
  /** Namen, die mehr als einen Eintrag treffen: anzeigen ja, automatisch verlinken nein. */
  ambiguous: Set<string>;
}

export interface NameIndexSpec<T> {
  key(entry: T): string | undefined;
  /** Alle Schreibweisen, wichtigste zuerst — die erste gewinnt den Namensplatz. */
  names(entry: T): (string | undefined)[];
  /** Unterscheidet zwei Einträge; gleiche Identität ist keine Mehrdeutigkeit. */
  identity(entry: T): string;
  /**
   * Weitere Schreibweisen fremder Quellen. Sie füllen nur Plätze, die kein echter Name
   * belegt — ein Alias darf einen bestehenden Treffer nie mehrdeutig machen.
   */
  aliases?(entry: T): (string | undefined)[];
}

export function buildNameIndex<T>(entries: Iterable<T>, spec: NameIndexSpec<T>): NameIndex<T> {
  const byKey = new Map<string, T>();
  const byName = new Map<string, T>();
  const ambiguous = new Set<string>();
  const list = [...entries];
  const aliasOwned = new Set<string>();

  const claim = (entry: T, raw: string | undefined, isAlias: boolean) => {
    const name = normName(raw);
    if (!name) return;
    const seen = byName.get(name);
    if (!seen) {
      byName.set(name, entry);
      if (isAlias) aliasOwned.add(name);
      return;
    }
    if (isAlias && !aliasOwned.has(name)) return;
    if (spec.identity(seen) !== spec.identity(entry)) ambiguous.add(name);
  };

  for (const entry of list) {
    const key = spec.key(entry);
    if (key) byKey.set(key, entry);
    for (const raw of spec.names(entry)) claim(entry, raw, false);
  }
  if (spec.aliases) {
    for (const entry of list) for (const raw of spec.aliases(entry)) claim(entry, raw, true);
  }

  return { byKey, byName, ambiguous };
}

/**
 * Bibliothekseintrag zu einem Verweis; `undefined` = die Bibliothek kennt ihn nicht.
 * Kein früher Ausstieg bei Key-Fehltreffer: ein Key aus einer nicht installierten
 * Bibliothek darf trotzdem über den Namen auflösen.
 */
export function matchByRef<T>(
  index: NameIndex<T>,
  ref: { sourceKey?: string; name?: string },
): T | undefined {
  const key = ref.sourceKey?.trim();
  if (key) {
    const hit = index.byKey.get(key);
    if (hit) return hit;
  }
  const name = normName(ref.name);
  return name ? index.byName.get(name) : undefined;
}

/**
 * Verlinkt einen rohen Namen NUR, wenn er eindeutig ist — ein falscher Key wäre schlimmer
 * als keiner. Anders als `matchByRef` (liefert auch bei Mehrdeutigkeit den Erst-Treffer)
 * für Aufrufer, die einen NEUEN Verweis anlegen statt einen bestehenden aufzulösen.
 */
export function linkByName<T extends { key?: string }>(index: NameIndex<T>, name: string): { sourceKey?: string } {
  const key = normName(name);
  const hit = key ? index.byName.get(key) : undefined;
  return hit?.key && !index.ambiguous.has(key) ? { sourceKey: hit.key } : {};
}
