/**
 * Zahlen aus Text, der aus PDF-Feldern, Markdown-Tabellen und Fremd-APIs kommt.
 * Alle drei liefern statt einer Zahl auch „", „-" oder „2d6" — nie ein Wurf.
 */

/** Ganzzahl aus einem Formular-/Bogenwert; alles Unparsebare wird 0. */
export function int(v: unknown): number {
  return parseInt(String(v ?? ''), 10) || 0;
}

/** Zahl oder Ersatzwert; deckt `NaN`, leer und „-" mit ab. */
export function numOr(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Erste Ganzzahl in einem Text: „1d10" → 1, „Slot Level 3" → 3, ohne Treffer 0. */
export function firstInt(v: unknown): number {
  return Number(String(v ?? '').match(/(\d+)/)?.[1] ?? 0);
}

/** Modifikator-Schreibweise: 3 → „+3", -1 → „-1". */
export function sign(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}
