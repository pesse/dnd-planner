/*
 * Diff-Highlighting für Editoren: vergleicht einen aktuellen Feldwert gegen die
 * zuletzt gespeicherte Version und liefert eine Richtung für die farbliche
 * Hervorhebung.
 *
 *   'up'   = erhöht / hinzugefügt / geändert  → grün
 *   'down' = vermindert / geleert (entfernt)  → rot
 *   'none' = unverändert / kein Baseline-Wert  → keine Tönung
 *
 * Die zugehörigen globalen CSS-Klassen `.diff-up` / `.diff-down` liegen in app.css.
 */

export type DiffDir = 'none' | 'up' | 'down';

const NUM_RE = /^[+-]?\d+(?:[.,]\d+)?$/;

/** Parst Zahlen, Zahl-Strings, Komma-Dezimale und Vorzeichen ("+2", "15", "1,5") → number, sonst null. */
function asNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const t = v.trim().replace(',', '.');
    return NUM_RE.test(t) ? parseFloat(t) : null;
  }
  return null;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a == null || b == null) return false;
  // Werte hier sind einfache Snapshots (keine Proxies) — JSON-Vergleich genügt.
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Bildet (alt, neu) auf eine Highlight-Richtung ab. Grün = up (erhöht/hinzugefügt/geändert), Rot = down (vermindert/entfernt). */
export function classifyChange(oldVal: unknown, newVal: unknown): DiffDir {
  if (oldVal === undefined) return 'none'; // kein Baseline-Wert für dieses Feld
  if (deepEqual(oldVal, newVal)) return 'none';

  if (typeof oldVal === 'boolean' || typeof newVal === 'boolean')
    return newVal ? 'up' : 'down'; // false→true = up, true→false = down

  const o = asNumber(oldVal);
  const n = asNumber(newVal);
  if (o !== null && n !== null) return n > o ? 'up' : n < o ? 'down' : 'none';

  const os = oldVal == null ? '' : String(oldVal);
  const ns = newVal == null ? '' : String(newVal);
  if (ns.trim() === '' && os.trim() !== '') return 'down'; // geleert / entfernt
  return 'up'; // hinzugefügt oder geändert
}

/**
 * Svelte-Action: toggelt `.diff-up` / `.diff-down` per classList (nicht über das
 * statische class-Attribut), reaktiv über den update-Hook. Da die Klasse zur
 * Laufzeit gesetzt wird, müssen die CSS-Regeln global sein (app.css).
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
