import { invoke } from '@tauri-apps/api/core';
import { createHoverTip } from '../utils/hoverTip.svelte';
import type { Item } from '../types';

/**
 * Gegenstandsdaten des Hover-Tooltips, MODUL-weit geteilt von Bogen und Formular. Anders
 * als beim Zauber-Picker wird VORAB geladen: der Bogen zeigt die Waffen-/Rüstungszeile
 * schon in der Tabelle.
 */
const itemCache = new Map<string, Item>();

export interface ItemHover {
  readonly item: Item | null;
  readonly x: number;
  readonly y: number;
  /** null, solange (oder falls) nichts kam. */
  data(path: string): Item | null;
  show(e: MouseEvent, path: string): void;
  move(e: MouseEvent): void;
  hide(): void;
}

export function createItemHover(paths: () => Iterable<string>): ItemHover {
  const tip = createHoverTip<Item>();
  let loaded = $state<Record<string, Item | null>>({});
  // Merker außerhalb der Runen: `loaded` im Effekt zu LESEN würde ihn bei jedem
  // eintreffenden Ladevorgang erneut anstoßen.
  const requested = new Set<string>();

  $effect(() => {
    for (const path of paths()) {
      if (requested.has(path)) continue;
      requested.add(path);
      const hit = itemCache.get(path);
      if (hit) { loaded[path] = hit; continue; }
      loaded[path] = null;
      invoke<string>('read_file_content', { path })
        .then((content) => {
          const data = JSON.parse(content) as Item;
          itemCache.set(path, data);
          loaded[path] = data;
        })
        .catch(() => {});
    }
  });

  return {
    get item() {
      return tip.data;
    },
    get x() {
      return tip.x;
    },
    get y() {
      return tip.y;
    },
    data(path: string) {
      return loaded[path] ?? null;
    },
    show(e: MouseEvent, path: string) {
      tip.show(e, loaded[path] ?? null);
    },
    move: tip.move,
    hide: tip.hide,
  };
}
