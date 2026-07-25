/**
 * Kleine, generische Prüf-Helfer für Eval-Assertions.
 *
 * Absicht: Die typischen Prüfungen auf einem JSON-Ergebnis (Feld gefüllt, Text lang
 * genug, Begriff erwähnt, Feld unverändert) sollen einzeilig sein, damit eine neue
 * Strecke wirklich nur aus Fällen + Erwartungen besteht. Alles hier ist bewusst
 * tolerant gegen `string | string[] | undefined`, weil die App-Schemas Beschreibungen
 * mal als Absatz-Array und mal als String führen.
 */

/** `string | string[] | unknown` → ein Text (Arrays werden zeilenweise verbunden). */
export function text(v: unknown): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string').join('\n');
  return '';
}

/** Gefüllt? Arrays: mindestens ein Element; Strings: nicht nur Whitespace. */
export function nonEmpty(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return text(v).trim().length > 0;
}

/** Mindestlänge eines Textfelds (nach Trim). */
export function minChars(v: unknown, n: number): boolean {
  return text(v).trim().length >= n;
}

/** Enthält der Text/das Array EINEN der Begriffe (Groß-/Kleinschreibung egal)? */
export function mentions(v: unknown, ...needles: string[]): boolean {
  const hay = text(v).toLowerCase();
  return needles.some((n) => hay.includes(n.toLowerCase()));
}

/** Enthält der Text/das Array ALLE Begriffe? */
export function mentionsAll(v: unknown, ...needles: string[]): boolean {
  const hay = text(v).toLowerCase();
  return needles.every((n) => hay.includes(n.toLowerCase()));
}

/** Zahl im (inklusiven) Bereich. */
export function inRange(v: unknown, min: number, max: number): boolean {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
}

/** Strukturgleichheit über JSON — reicht für die flachen App-Schemas. */
export function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Blieben die genannten Felder gegenüber der Vorlage unverändert? Die zentrale
 * Prüfung für „überarbeiten"-Prompts: die KI soll NUR das Gewünschte anfassen.
 */
export function unchanged<T extends object>(before: T, after: T, ...keys: (keyof T)[]): boolean {
  return keys.every((k) => same(before[k], after[k]));
}
