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

  // Nur auf Breitenänderungen und außerhalb des Callbacks: die neue Schriftgröße ändert die
  // Höhe, das meldete der Observer sonst sofort wieder („ResizeObserver loop …"-Fehler).
  let width = -1;
  let frame = 0;
  const ro = new ResizeObserver(([entry]) => {
    if (entry.contentRect.width === width) return;
    width = entry.contentRect.width;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(fit);
  });
  ro.observe(node);
  // Cinzel lädt per Webfont nach — gemessen mit der Fallback-Schrift passte es sonst nur zufällig.
  void document.fonts.ready.then(fit);

  return {
    update(next: { min?: number; text?: string } = {}) {
      min = next.min ?? 0.6;
      queueMicrotask(fit);
    },
    destroy() {
      cancelAnimationFrame(frame);
      ro.disconnect();
    },
  };
}
