/** Zauberverweise (`[Feuerball](spell:srd-2024_fireball)`) im Regeltext: Tooltip und Sprung zur Karte. */
import { getSpellLibrary, spellInfoByKey } from '../spellLibrary';
import { openSpellRef, SPELL_REF_SCHEME } from '../services/vaultLinks';
import { createRefLinks } from './refLinks.svelte';
import { loadSpellCached } from './spellHover.svelte';
import type { Spell } from '../types';

const links = createRefLinks<Spell>({
  scheme: SPELL_REF_SCHEME,
  async load(key) {
    const info = spellInfoByKey(await getSpellLibrary(), key);
    return info?.path ? loadSpellCached(key, info.path) : null;
  },
  open: (key) => void openSpellRef(key),
});

export const spellRefTip = {
  get spell() {
    return links.tip.data;
  },
  get x() {
    return links.tip.x;
  },
  get y() {
    return links.tip.y;
  },
};

export const spellRefLinks = links.action;
