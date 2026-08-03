/**
 * Die fünf Bibliotheken, die das Charakter-Formular für Autocomplete, Tooltips und die
 * Altformat-Erkennung braucht. Geladen wird einmal je Formular, indiziert reaktiv.
 */
import { getItemsByDir, buildItemIndex, type ItemInfo } from '../itemLibrary';
import { getSpellLibrary, buildSpellIndex, type SpellInfo } from '../spellLibrary';
import { getClasses, type ClassInfo } from '../classLibrary';
import { getSpeciesList, type SpeciesInfo } from '../speciesLibrary';
import { getBackgroundsList, type BackgroundInfo } from '../backgroundsLibrary';
import { DIR_TO_CATEGORY } from '../itemLabels';

export function createFormLibraries() {
  let itemsByDir = $state<Record<string, ItemInfo[]>>({});
  let spells = $state<SpellInfo[]>([]);
  let classes = $state<ClassInfo[]>([]);
  let species = $state<SpeciesInfo[]>([]);
  let backgrounds = $state<BackgroundInfo[]>([]);

  $effect(() => {
    Promise.all(
      Object.keys(DIR_TO_CATEGORY).map((dir) => getItemsByDir(dir).then((items) => ({ dir, items }))),
    ).then((results) => {
      const map: Record<string, ItemInfo[]> = {};
      for (const { dir, items } of results) map[dir] = items;
      itemsByDir = map;
    });
  });
  $effect(() => { getSpellLibrary().then((x) => { spells = x; }); });
  $effect(() => { getClasses().then((x) => { classes = x; }); });
  $effect(() => { getSpeciesList().then((x) => { species = x; }); });
  $effect(() => { getBackgroundsList().then((x) => { backgrounds = x; }); });

  const itemIndex = $derived(buildItemIndex(itemsByDir));
  const spellIndex = $derived(buildSpellIndex(spells));

  return {
    get itemsByDir() { return itemsByDir; },
    get weapons() { return itemsByDir.weapon ?? []; },
    get itemIndex() { return itemIndex; },
    get spells() { return spells; },
    get spellIndex() { return spellIndex; },
    get classes() { return classes; },
    get species() { return species; },
    get backgrounds() { return backgrounds; },
  };
}
