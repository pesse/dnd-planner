import { spellKeyOf, type Spell } from './schemas/spell';

/**
 * Zauber-Icon aus `static/art/spells/<slug>.webp`, Slug = Key ohne Quellen-Präfix
 * (`srd-2024_fireball` → `fireball`). Ob es das Bild gibt, entscheidet erst das `<img>` —
 * eigene Zauber haben keins.
 */
export function spellArtUrl(spell: Spell): string | null {
  const key = spellKeyOf(spell as unknown as Record<string, unknown>);
  const slug = key.slice(key.indexOf('_') + 1);
  return slug ? `/art/spells/${slug}.webp` : null;
}
