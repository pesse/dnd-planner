/** Die Bild-URLs der Startseite, aus dem, was gerade unter `vault/art/` liegt. */
import { artUrl, listArt } from '$lib/artUrl';

export interface StartArtPool {
  figures: string[];
  icons: string[];
}

const FIGURE_DIRS = ['figures', 'combos', 'classes', 'backgrounds'];
const ICON_DIRS = ['spells', 'monsters', 'items', 'feats'];

/** Die Gliederpuppe ist eine Ausrüstungsvorlage, keine Szene. */
const isScene = (name: string): boolean => !name.endsWith('/paperdoll');

export function sortArt(names: string[]): StartArtPool {
  const pool: StartArtPool = { figures: [], icons: [] };
  for (const name of names) {
    const dir = name.slice(0, name.indexOf('/'));
    if (FIGURE_DIRS.includes(dir) && isScene(name)) pool.figures.push(artUrl(name));
    else if (ICON_DIRS.includes(dir)) pool.icons.push(artUrl(name));
  }
  return pool;
}

/** Ohne Bild-Packs bleibt der Pool leer und die Startseite ruhig. */
export async function loadStartArtPool(): Promise<StartArtPool> {
  try {
    return sortArt(await listArt());
  } catch {
    return { figures: [], icons: [] };
  }
}
