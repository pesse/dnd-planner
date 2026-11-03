/**
 * `use:pinnableTip={text}` — Schwebe-Tooltip wie `textTip`, der sich per Klick als Fenster anheften lässt.
 * Auf Bedienelementen gehört der Linksklick der eigenen Aktion; dort heftet der Rechtsklick an.
 */
import { pinTip, tooltipSpot } from '../../../services/battleMap/pinnedTips.svelte';
import { textTip } from '../../textTip.svelte';

const INTERACTIVE = 'button, a, input, label, select, textarea';

export function pinnableTip(node: HTMLElement, text: string | null | undefined) {
  let current = text;
  let spot = { x: 0, y: 0 };
  // Vor `textTip`s mousedown, der den Tooltip ausblendet.
  const measure = (e: MouseEvent) => (spot = tooltipSpot(e));
  node.addEventListener('mousedown', measure, true);
  const inner = textTip(node, text);
  const pin = (e: MouseEvent) => {
    if (!current?.trim()) return;
    e.preventDefault();
    pinTip(current, spot.x, spot.y);
  };
  const click = (e: MouseEvent) => {
    if (!node.closest(INTERACTIVE)) pin(e);
  };
  node.addEventListener('click', click);
  node.addEventListener('contextmenu', pin);
  return {
    update(next: string | null | undefined) {
      current = next;
      inner.update(next);
    },
    destroy() {
      node.removeEventListener('click', click);
      node.removeEventListener('contextmenu', pin);
      node.removeEventListener('mousedown', measure, true);
      inner.destroy();
    },
  };
}
