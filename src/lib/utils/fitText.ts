/** Svelte-Action: verkleinert die Schrift eines einzeiligen Elements, bis es in seine Breite passt. */
export function fitText(node: HTMLElement, opts: { min?: number; text?: string } = {}) {
  let min = opts.min ?? 0.6;

  function fit() {
    node.style.fontSize = '';
    const overflow = node.scrollWidth / node.clientWidth;
    if (overflow > 1) {
      const base = parseFloat(getComputedStyle(node).fontSize);
      node.style.fontSize = `${base * Math.max(min, 1 / overflow)}px`;
    }
  }

  const ro = new ResizeObserver(fit);
  ro.observe(node);
  // Cinzel lädt per Webfont nach — gemessen mit der Fallback-Schrift passte es sonst nur zufällig.
  void document.fonts.ready.then(fit);

  return {
    update(next: { min?: number; text?: string } = {}) {
      min = next.min ?? 0.6;
      queueMicrotask(fit);
    },
    destroy: () => ro.disconnect(),
  };
}
