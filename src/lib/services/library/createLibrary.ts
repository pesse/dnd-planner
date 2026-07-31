/**
 * Memoisierter Lese-Index über einen flachen Vault-Ordner. Geschrieben wird immer
 * über den jeweiligen Karten-Editor, nie hier.
 */
import { invoke } from '@tauri-apps/api/core';

export interface FileContext {
  path: string;
  filename: string;
}

/**
 * Liest einen Ordner Datei für Datei. `list_json_files` liefert `[]` bei fehlendem
 * Ordner, eine unparsebare Datei fällt auf `fallback` — eine leere oder kaputte
 * Bibliothek darf weder werfen noch einen Eintrag verschlucken.
 */
export async function scanJsonFolder<T>(
  dir: string,
  read: (data: Record<string, any>, ctx: FileContext) => T,
  fallback: (ctx: FileContext) => T,
): Promise<T[]> {
  const files = await invoke<string[]>('list_json_files', { path: dir });
  return Promise.all(
    files.map(async (filename) => {
      const ctx = { path: `${dir}/${filename}`, filename };
      try {
        return read(JSON.parse(await invoke<string>('read_file_content', { path: ctx.path })), ctx);
      } catch {
        return fallback(ctx);
      }
    }),
  );
}

export interface LibrarySpec<T> {
  /** Vault-Ordner, flach gelesen. */
  path: string;
  read(data: Record<string, any>, ctx: FileContext): T;
  /** Eintrag für eine unparsebare Datei; ohne Angabe nur Name + Pfad. */
  fallback?(ctx: FileContext): T;
  /** Anzeigename (deutsch zuerst) — bestimmt Sortierung und Suchreihenfolge. */
  displayName(entry: T): string;
  /** Bibliotheks-Key eines Eintrags, für `loadByKey`. */
  key?(entry: T): string | undefined;
  maxResults?: number;
}

export interface Library<T> {
  path: string;
  list(): Promise<T[]>;
  invalidate(): void;
  /** Volle Datei zum Bibliotheks-Key; null = nicht vorhanden oder unparsebar. */
  loadByKey<R>(key: string, parse: (raw: Record<string, unknown>) => R | null): Promise<R | null>;
  /** Namenssuche: deutsche Anzeige zuerst, englischer Originalname als Fallback. */
  search(library: T[], query: string, maxResults?: number): T[];
}

export function createLibrary<T extends { name: string; path: string }>(
  spec: LibrarySpec<T>,
): Library<T> {
  const display = spec.displayName;
  const defaultMax = spec.maxResults ?? 10;
  const fallback = spec.fallback ?? (({ path, filename }: FileContext) =>
    ({ name: filename.replace('.json', ''), path }) as T);

  let cache: T[] | null = null;

  async function list(): Promise<T[]> {
    if (cache) return cache;
    try {
      const entries = await scanJsonFolder(spec.path, spec.read, fallback);
      entries.sort((a, b) => display(a).localeCompare(display(b), 'de'));
      cache = entries;
    } catch {
      cache = [];
    }
    return cache;
  }

  return {
    path: spec.path,
    list,

    invalidate() {
      cache = null;
    },

    async loadByKey(key, parse) {
      if (!key || !spec.key) return null;
      try {
        const info = (await list()).find((e) => spec.key!(e) === key);
        if (!info) return null;
        return parse(JSON.parse(await invoke<string>('read_file_content', { path: info.path })));
      } catch {
        return null;
      }
    },

    search(library, query, maxResults = defaultMax) {
      if (!query.trim()) return [];
      const q = query.toLowerCase();
      const hits = library.filter(
        (e) => display(e).toLowerCase().includes(q) || e.name.toLowerCase().includes(q),
      );
      hits.sort((a, b) => {
        const an = display(a).toLowerCase();
        const bn = display(b).toLowerCase();
        // Prefix-Treffer zuerst: „Wald…" soll bei „wald" vor „Zauberwald" stehen.
        if (an.startsWith(q) !== bn.startsWith(q)) return an.startsWith(q) ? -1 : 1;
        return an.localeCompare(bn, 'de');
      });
      return hits.slice(0, maxResults);
    },
  };
}
