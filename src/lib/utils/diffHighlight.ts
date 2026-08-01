/*
 * Diff-Highlighting der Editoren: Feldwert gegen die letzte gespeicherte Fassung.
 * 'up' = erhöht/hinzugefügt/geändert (grün), 'down' = vermindert/geleert (rot).
 * Die Klassen `.diff-up`/`.diff-down` liegen global in app.css, siehe `diffMark`.
 */

export type DiffDir = 'none' | 'up' | 'down';

const NUM_RE = /^[+-]?\d+(?:[.,]\d+)?$/;

/** Auch Zahl-Strings mit Vorzeichen und Komma-Dezimale („+2", „1,5"). */
function asNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const t = v.trim().replace(',', '.');
    return NUM_RE.test(t) ? parseFloat(t) : null;
  }
  return null;
}

/**
 * Objekt-Schlüssel sortiert: die Baseline trägt die Zod-Reihenfolge, ein Editor hängt
 * Felder in Klick-Reihenfolge an — `JSON.stringify` hielte solche Objekte dauerhaft für
 * geändert. Array-Reihenfolge bleibt, die IST Teil des Werts.
 */
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  const parts = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`);
  return `{${parts.join(',')}}`;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a == null || b == null) return false;
  // Werte hier sind einfache Snapshots (keine Proxies) — JSON-Vergleich genügt.
  return stableStringify(a) === stableStringify(b);
}

export function classifyChange(oldVal: unknown, newVal: unknown): DiffDir {
  if (oldVal === undefined) return 'none'; // kein Baseline-Wert — nicht „hinzugefügt"
  if (deepEqual(oldVal, newVal)) return 'none';

  if (typeof oldVal === 'boolean' || typeof newVal === 'boolean')
    return newVal ? 'up' : 'down';

  const o = asNumber(oldVal);
  const n = asNumber(newVal);
  if (o !== null && n !== null) return n > o ? 'up' : n < o ? 'down' : 'none';

  const os = oldVal == null ? '' : String(oldVal);
  const ns = newVal == null ? '' : String(newVal);
  if (ns.trim() === '' && os.trim() !== '') return 'down';
  return 'up';
}

/**
 * Setzt die Klassen per classList statt übers class-Attribut — deshalb greift Sveltes
 * Scoping nicht und die Regeln müssen global in app.css stehen.
 */
export function diffMark(node: HTMLElement, dir: DiffDir) {
  const apply = (d: DiffDir) => {
    node.classList.toggle('diff-up', d === 'up');
    node.classList.toggle('diff-down', d === 'down');
  };
  apply(dir);
  return {
    update: apply,
    destroy: () => node.classList.remove('diff-up', 'diff-down'),
  };
}
