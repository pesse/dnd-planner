import { invoke } from '@tauri-apps/api/core';
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
  let item = $state<Item | null>(null);
  let x = $state(0);
  let y = $state(0);
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
      return item;
    },
    get x() {
      return x;
    },
    get y() {
      return y;
    },
    data(path: string) {
      return loaded[path] ?? null;
    },
    show(e: MouseEvent, path: string) {
      const data = loaded[path];
      if (!data) return;
      item = data;
      x = e.clientX + 14;
      y = e.clientY + 14;
    },
    move(e: MouseEvent) {
      if (!item) return;
      x = e.clientX + 14;
      y = e.clientY + 14;
    },
    hide() {
      item = null;
    },
  };
}
