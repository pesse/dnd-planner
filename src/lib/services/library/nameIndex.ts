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
}

export function buildNameIndex<T>(entries: Iterable<T>, spec: NameIndexSpec<T>): NameIndex<T> {
  const byKey = new Map<string, T>();
  const byName = new Map<string, T>();
  const ambiguous = new Set<string>();

  for (const entry of entries) {
    const key = spec.key(entry);
    if (key) byKey.set(key, entry);
    for (const raw of spec.names(entry)) {
      const name = normName(raw);
      if (!name) continue;
      const seen = byName.get(name);
      if (seen) {
        if (spec.identity(seen) !== spec.identity(entry)) ambiguous.add(name);
        continue;
      }
      byName.set(name, entry);
    }
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
