/**
 * Ersetzt den nativen `title`-Tooltip app-weit durch den eigenen: das Attribut wandert beim
 * Überfahren nach `data-tip`, sonst erschiene der Browser-Tooltip zusätzlich.
 */
import { createHoverTip } from '../utils/hoverTip.svelte';

const tip = createHoverTip<string>();
const DELAY_MS = 600;

export const titleTipState = {
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

/** Ein Icon-Knopf hat oft nur seinen `title` als zugänglichen Namen. */
function adopt(el: Element): string | null {
  const title = el.getAttribute('title');
  if (title !== null) {
    el.removeAttribute('title');
    el.setAttribute('data-tip', title);
    if (!el.hasAttribute('aria-label') && !el.textContent?.trim()) el.setAttribute('aria-label', title);
  }
  return el.getAttribute('data-tip')?.trim() || null;
}

export function installTitleTips(): () => void {
  let current: Element | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last: MouseEvent | null = null;

  // Wie der native: erst nach einer Pause, danach wechselt er beim Weiterfahren sofort.
  const over = (e: MouseEvent) => {
    const el = (e.target as Element).closest?.('[title], [data-tip]') ?? null;
    if (el === current) return;
    current = el;
    clearTimeout(timer);
    const text = el ? adopt(el) : null;
    if (!el || !text) return tip.hide();
    if (tip.data) return tip.show(e, text);
    last = e;
    timer = setTimeout(() => current === el && last && tip.show(last, adopt(el)), DELAY_MS);
  };
  const move = (e: MouseEvent) => {
    last = e;
    if (!current) return;
    // Svelte setzt einen geänderten `title` neu, während die Maus noch darauf steht.
    if (current.hasAttribute('title')) {
      const text = adopt(current);
      if (tip.data) tip.data = text;
    }
    tip.move(e);
  };
  const reset = () => {
    clearTimeout(timer);
    current = null;
    tip.hide();
  };

  document.addEventListener('mouseover', over);
  document.addEventListener('mousemove', move);
  document.addEventListener('mousedown', reset);
  document.documentElement.addEventListener('mouseleave', reset);
  return () => {
    clearTimeout(timer);
    document.removeEventListener('mouseover', over);
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mousedown', reset);
    document.documentElement.removeEventListener('mouseleave', reset);
  };
}
