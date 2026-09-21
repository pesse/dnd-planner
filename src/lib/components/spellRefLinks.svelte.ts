/**
 * Zauberverweise in gerendertem Regeltext (`<a href="spell:…">`) schweben und klicken lassen.
 *
 * Der Tooltip-Zustand liegt MODUL-weit: Regeltext steht an Dutzenden Stellen gleichzeitig im
 * DOM (Karten, Bogen, Dialoge), und alle zeigen denselben einen Tooltip aus `+page.svelte`.
 */
import { getSpellLibrary, spellInfoByKey } from '../spellLibrary';
import { openSpellRef, spellRefKey } from '../services/vaultLinks';
import { createHoverTip } from '../utils/hoverTip.svelte';
import { loadSpellCached } from './spellHover.svelte';
import type { Spell } from '../types';

const SELECTOR = 'a[href^="spell:"]';

const tip = createHoverTip<Spell>();

export const spellRefTip = {
  get spell() {
    return tip.data;
  },
  get x() {
    return tip.x;
  },
  get y() {
    return tip.y;
  },
};

// Verhindert, dass ein langsamer Ladevorgang den Tooltip aufpoppt, wenn die Maus längst weiter ist.
let hovering = '';

function hide(): void {
  hovering = '';
  tip.hide();
}

async function show(e: MouseEvent, key: string): Promise<void> {
  tip.at(e);
  hovering = key;
  const info = spellInfoByKey(await getSpellLibrary(), key);
  if (!info?.path) return;
  const data = await loadSpellCached(key, info.path);
  if (data && hovering === key) tip.data = data;
}

function anchorOf(target: EventTarget | null): HTMLAnchorElement | null {
  return target instanceof Element ? target.closest<HTMLAnchorElement>(SELECTOR) : null;
}

const keyOf = (a: HTMLAnchorElement): string => spellRefKey(a.getAttribute('href') ?? '');

/** Svelte-Action für einen Container mit gerendertem Markdown; delegiert, das Markup ist `{@html}`. */
export function spellRefLinks(node: HTMLElement) {
  const over = (e: MouseEvent) => {
    const a = anchorOf(e.target);
    if (!a) return;
    const key = keyOf(a);
    if (key && key !== hovering) void show(e, key);
  };
  const move = (e: MouseEvent) => {
    if (anchorOf(e.target)) tip.move(e);
  };
  const out = (e: MouseEvent) => {
    const from = anchorOf(e.target);
    // Der Wechsel zwischen Kindknoten desselben Verweises ist kein Verlassen.
    if (from && anchorOf(e.relatedTarget) !== from) hide();
  };
  const click = (e: MouseEvent) => {
    const a = anchorOf(e.target);
    if (!a) return;
    const key = keyOf(a);
    if (!key) return;
    e.preventDefault();
    hide();
    void openSpellRef(key);
  };

  node.addEventListener('mouseover', over);
  node.addEventListener('mousemove', move);
  node.addEventListener('mouseout', out);
  node.addEventListener('click', click);

  return {
    destroy() {
      node.removeEventListener('mouseover', over);
      node.removeEventListener('mousemove', move);
      node.removeEventListener('mouseout', out);
      node.removeEventListener('click', click);
      hide();
    },
  };
}
