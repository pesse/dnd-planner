/** Die Figuren der Startseite, aus dem, was gerade unter `vault/art/` liegt. */
import { artUrl, listArt } from '$lib/artUrl';

const FIGURE_DIRS = ['figures', 'combos', 'classes', 'backgrounds'];

/** Die Gliederpuppe ist eine Ausrüstungsvorlage, keine Szene. */
const isScene = (name: string): boolean => !name.endsWith('/paperdoll');

export const figureArt = (names: string[]): string[] =>
  names.filter((n) => FIGURE_DIRS.includes(n.slice(0, n.indexOf('/'))) && isScene(n)).map(artUrl);

/** Ohne Bild-Packs bleibt die Liste leer und die Startseite ruhig. */
export async function loadStartFigures(): Promise<string[]> {
  try {
    return figureArt(await listArt());
  } catch {
    return [];
  }
}
