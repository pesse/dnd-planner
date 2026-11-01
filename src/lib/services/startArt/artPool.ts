/**
 * Die Bild-URLs der Startseite: Figuren aus Volk × Äußerem × Klasse/Unterklasse/Hintergrund,
 * Icons aus den Zauber-, Monster-, Gegenstands- und Talent-Bibliotheken.
 */
import { artUrl } from '$lib/artUrl';
import { PRESENTATIONS } from '$lib/schemas/characterSchema';
import { featArtUrl, itemInfoArtUrl, monsterArtUrl, spellInfoArtUrl } from '$lib/libraryArt';
import { getSpellLibrary } from '$lib/spellLibrary';
import { getMonsterLibrary } from '$lib/monsterLibrary';
import { getItemsByDir, listItemDirs } from '$lib/itemLibrary';
import { getFeats } from '$lib/featsLibrary';
import { getClasses } from '$lib/classLibrary';
import { getSpeciesList } from '$lib/speciesLibrary';
import { getBackgroundsList } from '$lib/backgroundsLibrary';
import { slugOf } from '../wizard/originArt';

export interface StartArtPool {
  figures: string[];
  icons: string[];
}

const keysOf = (list: { key?: string }[]): string[] =>
  list.map((e) => e.key).filter((k): k is string => !!k).map(slugOf);

async function figureUrls(): Promise<string[]> {
  const [species, classes, backgrounds] = await Promise.all([getSpeciesList(), getClasses(), getBackgroundsList()]);
  const scenes = [
    'species',
    ...keysOf(classes.filter((c) => !c.subclassOf)).map((k) => `classes/${k}`),
    ...keysOf(classes.filter((c) => c.subclassOf)).map((k) => `subclasses/${k}`),
    ...keysOf(backgrounds).map((k) => `backgrounds/${k}`),
  ];
  return keysOf(species).flatMap((s) =>
    PRESENTATIONS.flatMap((look) => scenes.map((scene) => artUrl(`figures/${s}-${look}/${scene}`))),
  );
}

async function itemUrls(): Promise<string[]> {
  const dirs = await listItemDirs();
  const items = (await Promise.all(dirs.map((d) => getItemsByDir(d).catch(() => [])))).flat();
  return items.map(itemInfoArtUrl).filter((u): u is string => !!u);
}

const nonNull = (urls: (string | null)[]): string[] => urls.filter((u): u is string => !!u);

/**
 * Füllt `pool` nach und nach, damit die ersten Bilder nicht auf die 900 Gegenstände warten.
 * Fehlt eine Bibliothek, bleibt ihr Teil leer — welche URL wirklich ein Bild hat, entscheidet der Lader.
 */
export function fillStartArtPool(pool: StartArtPool): Promise<void> {
  const add = (target: string[]) => (urls: string[]) => { target.push(...urls); };
  const none = () => {};
  return Promise.all([
    figureUrls().then(add(pool.figures), none),
    getSpellLibrary().then((l) => nonNull(l.map(spellInfoArtUrl))).then(add(pool.icons), none),
    getFeats().then((l) => nonNull(l.map(featArtUrl))).then(add(pool.icons), none),
    getMonsterLibrary().then((l) => nonNull(l.map((h) => monsterArtUrl(h.monster)))).then(add(pool.icons), none),
    itemUrls().then(add(pool.icons), none),
  ]).then(none);
}
