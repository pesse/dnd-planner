import { getAllItemsByDir, buildItemIndex } from '$lib/itemLibrary';
import { getSpellLibrary, buildSpellIndex } from '$lib/spellLibrary';
import { getClasses } from '$lib/classLibrary';
import { getSpeciesByKey, getSpeciesList } from '$lib/speciesLibrary';
import { getBackgroundByKey, getBackgroundsList } from '$lib/backgroundsLibrary';
import { getFeats } from '$lib/featsLibrary';
import { getProgressionByKey } from '../classProgression';
import type { DdbImportLibraries } from './assemble';

export async function loadDdbImportLibraries(): Promise<DdbImportLibraries> {
  const [itemsByDir, spellList, classes, species, backgrounds, feats] = await Promise.all([
    getAllItemsByDir(), getSpellLibrary(), getClasses(), getSpeciesList(), getBackgroundsList(), getFeats(),
  ]);
  return {
    classes, species, backgrounds, feats, spellList,
    items: buildItemIndex(itemsByDir),
    spells: buildSpellIndex(spellList),
    speciesByKey: async (key) => (await getSpeciesByKey(key)) ?? null,
    backgroundByKey: async (key) => (await getBackgroundByKey(key)) ?? null,
    classByKey: getProgressionByKey,
  };
}
