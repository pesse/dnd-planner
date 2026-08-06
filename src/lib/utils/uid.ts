/**
 * Identität eines Charakters. Der Ordnername unter `vault/characters/` ist eine
 * generierte UID statt eines Namens-Slugs — nur so bleibt ein Charakter derselbe,
 * wenn sein Name sich ändert, und zwei gleichnamige Charaktere überschreiben sich nicht.
 */

/** 12 Hex-Zeichen aus `crypto.randomUUID()` — kurz genug für Ordner und Frontmatter. */
export function newUid(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

export function isUid(s: string): boolean {
  return /^[0-9a-f]{12}$/.test(s);
}
