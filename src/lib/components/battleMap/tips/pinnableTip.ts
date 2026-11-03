/**
 * `use:pinnableTip={text}` — Schwebe-Tooltip wie `textTip`, der sich per Klick als Fenster anheften lässt.
 * Auf Bedienelementen gehört der Linksklick der eigenen Aktion; dort heftet der Rechtsklick an.
 */
import { pinTip } from '../../../services/battleMap/pinnedTips.svelte';
import { textTip, textTipState } from '../../textTip.svelte';

const INTERACTIVE = 'button, a, input, label, select, textarea';

export function pinnableTip(node: HTMLElement, text: string | null | undefined) {
  let current = text;
  const inner = textTip(node, text);
  const pin = (e: MouseEvent) => {
    if (!current?.trim()) return;
    e.preventDefault();
    pinTip(current, textTipState.x || e.clientX, textTipState.y || e.clientY);
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
      inner.destroy();
    },
  };
}
