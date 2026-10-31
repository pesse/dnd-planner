/**
 * Verweise mit eigenem Schema in gerendertem Regeltext (`<a href="spell:…">`, `rule:…`)
 * schweben und klicken lassen. Delegiert, denn das Markup ist `{@html}`.
 */
import { createHoverTip, type HoverTip } from '../utils/hoverTip.svelte';

export interface RefScheme<T> {
  scheme: string;
  load(key: string): Promise<T | null>;
  /** Ohne Angabe bleibt der Klick wirkungslos — der Verweis ist dann nur Tooltip. */
  open?(key: string): void;
}

export interface RefLinks<T> {
  readonly tip: Pick<HoverTip<T>, 'data' | 'x' | 'y'>;
  action(node: HTMLElement): { destroy(): void };
}

export function createRefLinks<T>(spec: RefScheme<T>): RefLinks<T> {
  const selector = `a[href^="${spec.scheme}"]`;
  // Der Tooltip-Zustand liegt MODUL-weit: Regeltext steht an Dutzenden Stellen gleichzeitig
  // im DOM (Karten, Bogen, Dialoge), und alle zeigen denselben einen Tooltip aus `+page.svelte`.
  const tip = createHoverTip<T>();
  // Verhindert, dass ein langsamer Ladevorgang den Tooltip aufpoppt, wenn die Maus längst weiter ist.
  let hovering = '';

  const hide = () => {
    hovering = '';
    tip.hide();
  };

  async function show(e: MouseEvent, key: string): Promise<void> {
    tip.at(e);
    hovering = key;
    const data = await spec.load(key);
    if (data && hovering === key) tip.data = data;
  }

  const anchorOf = (target: EventTarget | null): HTMLAnchorElement | null =>
    target instanceof Element ? target.closest<HTMLAnchorElement>(selector) : null;
  const keyOf = (a: HTMLAnchorElement): string =>
    (a.getAttribute('href') ?? '').slice(spec.scheme.length).trim();

  function action(node: HTMLElement) {
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
      e.preventDefault();
      const key = keyOf(a);
      if (!key || !spec.open) return;
      hide();
      spec.open(key);
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

  return { tip, action };
}
