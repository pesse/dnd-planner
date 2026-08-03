import { loadSpellByPath, type SpellInfo } from '../spellLibrary';
import { createHoverTip } from '../utils/hoverTip.svelte';
import type { Spell } from '../types';

/**
 * Zauberdaten des Hover-Tooltips, MODUL-weit geteilt: Zeile und Dialog sind gleichzeitig
 * montiert und greifen auf dieselben Zauber zu. Vorab geladen wird nur, was der Aufrufer
 * in `preload` nennt — die ganze Klassenliste wären Dutzende Dateizugriffe für ein Hover.
 */
const spellCache = new Map<string, Spell | null>();

export async function loadSpellCached(name: string, path: string): Promise<Spell | null> {
  const hit = spellCache.get(name);
  if (hit !== undefined) return hit;
  const data = await loadSpellByPath(path);
  spellCache.set(name, data);
  return data;
}

export interface SpellHover {
  readonly spell: Spell | null;
  readonly x: number;
  readonly y: number;
  show(e: MouseEvent, name: string): Promise<void>;
  move(e: MouseEvent): void;
  hide(): void;
}

/** `byName` ist ein Getter, damit die nachladende Bibliothek des Aufrufers reaktiv bleibt. */
export function createSpellHover(
  byName: () => Map<string, SpellInfo>,
  preload?: () => Iterable<string>,
): SpellHover {
  const tip = createHoverTip<Spell>();
  // Verhindert, dass ein langsamer Ladevorgang den Tooltip aufpoppt, wenn die Maus
  // längst weiter ist.
  let hovering = '';

  if (preload) {
    // Merker außerhalb der Runen: der Cache füllt sich erst nach dem Lesen, ein erneuter
    // Effektlauf würde denselben Zauber sonst ein zweites Mal holen.
    const requested = new Set<string>();
    $effect(() => {
      const index = byName();
      for (const name of preload()) {
        if (requested.has(name)) continue;
        const path = index.get(name)?.path;
        if (!path) continue;
        requested.add(name);
        void loadSpellCached(name, path);
      }
    });
  }

  return {
    get spell() {
      return tip.data;
    },
    get x() {
      return tip.x;
    },
    get y() {
      return tip.y;
    },
    async show(e: MouseEvent, name: string) {
      tip.at(e);
      hovering = name;
      const info = byName().get(name);
      if (!info?.path) return;
      const data = await loadSpellCached(name, info.path);
      if (data && hovering === name) tip.data = data;
    },
    move: tip.move,
    hide() {
      hovering = '';
      tip.hide();
    },
  };
}
