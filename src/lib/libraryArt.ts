import { spellKeyOf, type Spell } from './schemas/spell';
import type { Monster } from './schemas/monster';
import { itemKeyOf, type Item } from './schemas/item';
import type { ItemInfo } from './itemLibrary';
import { keySlug, slugAscii } from './utils/text';
import { artUrl as artFileUrl } from './artUrl';

/**
 * Bilder der Bibliothek unter `vault/art/<art>/<slug>.avif`, Slug = Key ohne Quellen-Präfix
 * (`srd-2024_fireball` → `fireball`). Ob es das Bild gibt, entscheidet erst das `<img>` —
 * nicht jeder Eintrag hat eins.
 */
const artUrl = (kind: string, slug: string): string | null => (slug ? artFileUrl(`${kind}/${slug}`) : null);

export const spellArtUrl = (spell: Spell): string | null =>
  artUrl('spells', keySlug(spellKeyOf(spell as unknown as Record<string, unknown>)));

/** `key` am Bibliothekstalent, `sourceKey` am Eintrag aus `featsLibrary`. */
export const featArtUrl = (feat: { key?: string; sourceKey?: string }): string | null =>
  artUrl('feats', keySlug(feat.sourceKey || feat.key));

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
export const itemArtUrl = (item: Item): string | null =>
  itemKeyArtUrl(item.artKey || itemKeyOf(item as unknown as Record<string, unknown>));

export const itemInfoArtUrl = (item: ItemInfo): string | null => {
  const key = item.artKey || item.key;
  return key ? itemKeyArtUrl(key) : null;
};

const itemKeyArtUrl = (key: string): string | null =>
  artUrl('items', key.startsWith('srd-2024_') ? keySlug(key) : key);
