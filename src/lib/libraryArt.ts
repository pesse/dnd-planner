import { spellKeyOf, type Spell } from './schemas/spell';
import type { Monster } from './schemas/monster';
import { itemKeyOf, type Item } from './schemas/item';
import { keySlug, slugAscii } from './utils/text';

/**
 * Bilder der Bibliothek unter `static/art/<art>/<slug>.avif`, Slug = Key ohne Quellen-Präfix
 * (`srd-2024_fireball` → `fireball`). Ob es das Bild gibt, entscheidet erst das `<img>` —
 * nicht jeder Eintrag hat eins.
 */
const artUrl = (kind: string, slug: string): string | null => (slug ? `/art/${kind}/${slug}.avif` : null);

export const spellArtUrl = (spell: Spell): string | null =>
  artUrl('spells', keySlug(spellKeyOf(spell as unknown as Record<string, unknown>)));

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

/** Eigene Monster ohne Key heißen nach ihrer Datei: „Goblin-Kämpfer" → `goblin-kaempfer`. */
export const monsterArtUrl = (monster: Monster): string | null =>
  artUrl('monsters', monster.key
    ? keySlug(monster.key)
    : slugAscii(monster.name.toLowerCase().replace(/[äöüß]/g, (c) => UMLAUTS[c])));

/**
 * Eigene Gegenstände leihen sich ihren Namen oft von einer SRD-Waffe (`homebrew-sam_warhammer`);
 * außerhalb des SRD trägt das Bild deshalb den ganzen Key.
 */
export function itemArtUrl(item: Item): string | null {
  const key = itemKeyOf(item as unknown as Record<string, unknown>);
  return artUrl('items', key.startsWith('srd-2024_') ? keySlug(key) : key);
}
