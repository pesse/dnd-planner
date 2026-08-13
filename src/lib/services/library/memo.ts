/**
 * Cache MIT In-flight-Dedup für die Lese-Pfade des Vaults.
 *
 * Der Promise wird SOFORT abgelegt, nicht erst nach dem `await`: ein Charakterbogen fragt
 * dieselbe Bibliothek aus einem halben Dutzend Effekten gleichzeitig an, und bei „Cache nach
 * dem await setzen" laden alle Erstaufrufer einzeln — genau die Mehrfachlast, die das Öffnen
 * hängen ließ.
 */

export interface Memo<T> {
  get(): Promise<T>;
  invalidate(): void;
}

export interface MemoByKey<T> {
  get(key: string): Promise<T>;
  /** Ohne Argument: alles. */
  invalidate(key?: string): void;
}

export function memoOnce<T>(load: () => Promise<T>): Memo<T> {
  let pending: Promise<T> | null = null;
  return {
    get() {
      // Ein Fehlschlag darf sich nicht einbrennen — sonst bliebe die Bibliothek bis zum
      // Neustart leer, obwohl der nächste Versuch geklappt hätte.
      if (!pending) pending = load().catch((e) => { pending = null; throw e; });
      return pending;
    },
    invalidate() {
      pending = null;
    },
  };
}

export function memoByKey<T>(load: (key: string) => Promise<T>): MemoByKey<T> {
  const pending = new Map<string, Promise<T>>();
  return {
    get(key) {
      const hit = pending.get(key);
      if (hit) return hit;
      const p = load(key).catch((e) => { pending.delete(key); throw e; });
      pending.set(key, p);
      return p;
    },
    invalidate(key) {
      if (key === undefined) pending.clear();
      else pending.delete(key);
    },
  };
}
