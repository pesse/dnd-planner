/**
 * Namens-Normalisierung und Slugs für Dateinamen und Bibliotheks-Keys.
 */

/** Vergleichsform eines Namens: Index-Schlüssel, Suche, Gleichheit. */
export function normName(s: string | undefined | null): string {
  return (s ?? '').trim().toLowerCase();
}

const FILE_SLUG_KEEP = 'a-z0-9äöüß';

/**
 * Dateiname im Vault. Umlaute BLEIBEN erhalten — der Bestand ist so benannt, und
 * ein Wechsel auf ASCII würde eine bestehende Datei beim Speichern verdoppeln
 * statt zu überschreiben. Charakterordner trennen mit `_`, alles andere mit `-`.
 */
export function slugKeepUmlauts(name: string, sep: '-' | '_' = '-'): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, sep)
    .replace(new RegExp(`[^${FILE_SLUG_KEEP}${sep}]`, 'g'), '');
}

/** Umkehrung für die Anzeige: „schwarzer-drache" → „Schwarzer Drache". */
export function slugToName(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Slug-Anteil eines Bibliotheks-Keys, Open5e-Konvention `srd-2024_acid-arrow`.
 * Reines ASCII, weil der Key Identität ist und über Systemgrenzen geht.
 */
export function slugAscii(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Alles NACH dem ersten `_` eines Bibliotheks-Keys („srd-2024_wizard" → „wizard").
 * Nicht das letzte Segment: ein Slug darf `_` enthalten, das Herkunfts-Präfix nicht.
 */
export function keySlug(key: string | undefined | null): string {
  return key ? key.slice(key.indexOf('_') + 1) : '';
}

/**
 * Identität eines Merkmals im Charakter-Ledger. Jeder Nachschlag muss dieselbe
 * Form bilden, sonst findet er ein Merkmal ohne `key` nicht wieder.
 */
export function featureIdOf(f: { key?: string; name: string }): string {
  return f.key || normName(f.name);
}
