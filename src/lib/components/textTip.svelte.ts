/**
 * `use:textTip={text}` — der Schwebe-Tooltip aus `TextTooltip` statt des nativen `title`.
 * Der Zustand liegt MODUL-weit, `+page.svelte` montiert den einen Tooltip für alle Stellen.
 */
import { createHoverTip } from '../utils/hoverTip.svelte';

const tip = createHoverTip<string>();

export const textTipState = {
  get text() {
    return tip.data;
  },
  get x() {
    return tip.x;
  },
  get y() {
    return tip.y;
  },
};

export function textTip(node: HTMLElement, text: string | null | undefined) {
  let current = text?.trim() || null;
  let inside = false;

  const enter = (e: MouseEvent) => {
    inside = true;
    tip.show(e, current);
  };
  const leave = () => {
    inside = false;
    tip.hide();
  };

  node.addEventListener('mouseenter', enter);
  node.addEventListener('mousemove', tip.move);
  node.addEventListener('mouseleave', leave);
  // Ein Klick ändert meist den Zustand darunter; der alte Text bliebe sonst bis zum Verlassen stehen.
  node.addEventListener('mousedown', leave);

  return {
    update(next: string | null | undefined) {
      current = next?.trim() || null;
      if (!inside) return;
      if (current) tip.data = current;
      else tip.hide();
    },
    destroy() {
      node.removeEventListener('mouseenter', enter);
      node.removeEventListener('mousemove', tip.move);
      node.removeEventListener('mouseleave', leave);
      node.removeEventListener('mousedown', leave);
      if (inside) tip.hide();
    },
  };
}
