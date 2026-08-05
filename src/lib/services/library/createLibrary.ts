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
 * Eine leere oder kaputte Bibliothek darf weder werfen noch einen Eintrag verschlucken:
 * fehlender Ordner → `[]`, unparsebare Datei → `fallback`.
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

/** Gemeinsame Form der Lese-Indizes (Klassen, Spezies, Hintergründe): Anzeigename deutsch
 * zuerst, Bibliotheks-Key optional. Wer mehr Felder braucht (z.B. `ClassInfo.subclassOf`),
 * erweitert sie und gibt einen eigenen `read` an — der Standard bleibt sonst passend. */
export interface LibraryEntry {
  name: string;
  nameDe?: string;
  path: string;
  key?: string;
}

function defaultDisplayName(entry: LibraryEntry): string {
  return entry.nameDe ?? entry.name;
}

export interface LibrarySpec<T> {
  /** Vault-Ordner, flach gelesen. */
  path: string;
  /** Ohne Angabe: `{name, nameDe, path, key}` aus der Rohdatei, siehe `LibraryEntry`. */
  read?(data: Record<string, any>, ctx: FileContext): T;
  /** Eintrag für eine unparsebare Datei; ohne Angabe nur Name + Pfad. */
  fallback?(ctx: FileContext): T;
  /** Anzeigename; ohne Angabe `nameDe ?? name`. */
  displayName?(entry: T): string;
  /** Ohne diese Funktion kann `loadByKey` nichts finden. */
  key?(entry: T): string | undefined;
  maxResults?: number;
}

export interface Library<T> {
  path: string;
  list(): Promise<T[]>;
  invalidate(): void;
  /** Liest die VOLLE Datei nach; `list()` trägt nur den Index. */
  loadByKey<R>(key: string, parse: (raw: Record<string, unknown>) => R | null): Promise<R | null>;
  search(library: T[], query: string, maxResults?: number): T[];
  /**
   * Wie `search`, lädt zusätzlich jede Trefferdatei zu einem Draft; ein Parserfehler fällt auf
   * `blank(name)` zurück statt den Treffer zu verschlucken (Muster der „Neues X"-Vorlagensuche).
   */
  searchWithParser<R>(
    query: string,
    parse: (raw: Record<string, unknown>) => { ok: boolean; data?: R },
    blank: (name: string) => R,
    maxResults?: number,
  ): Promise<{ name: string; load: () => Promise<R> }[]>;
}

export function createLibrary<T extends LibraryEntry>(spec: LibrarySpec<T>): Library<T> {
  const display = spec.displayName ?? (defaultDisplayName as (entry: T) => string);
  const defaultMax = spec.maxResults ?? 10;
  const read = spec.read ?? ((data: Record<string, any>, { path, filename }: FileContext) =>
    ({ name: data.name ?? filename.replace('.json', ''), nameDe: data.nameDe, path, key: data.key }) as T);
  const fallback = spec.fallback ?? (({ path, filename }: FileContext) =>
    ({ name: filename.replace('.json', ''), path }) as T);

  let cache: T[] | null = null;

  async function list(): Promise<T[]> {
    if (cache) return cache;
    try {
      const entries = await scanJsonFolder(spec.path, read, fallback);
      entries.sort((a, b) => display(a).localeCompare(display(b), 'de'));
      cache = entries;
    } catch {
      cache = [];
    }
    return cache;
  }

  function searchEntries(entries: T[], query: string, maxResults: number): T[] {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const hits = entries.filter(
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
      return searchEntries(library, query, maxResults);
    },

    async searchWithParser(query, parse, blank, maxResults = defaultMax) {
      const hits = searchEntries(await list(), query, maxResults);
      return hits.map((entry) => ({
        name: display(entry),
        load: async () => {
          const raw = JSON.parse(await invoke<string>('read_file_content', { path: entry.path })) as Record<string, unknown>;
          const r = parse(raw);
          return r.ok && r.data !== undefined ? r.data : blank(display(entry));
        },
      }));
    },
  };
}
