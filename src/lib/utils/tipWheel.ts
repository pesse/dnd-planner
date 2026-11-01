/**
 * Svelte-Action: Mausrad scrollt den überlangen Schwebe-Tooltip statt der Seite darunter.
 * Der Tooltip ist `pointer-events: none` und folgt dem Cursor — das Rad-Ereignis landet also
 * nie bei ihm selbst, sondern muss am Fenster abgefangen werden.
 */
const LINE_PX = 16;

export function tipWheel(node: HTMLElement, content: unknown) {
  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey || node.scrollHeight <= node.clientHeight) return;
    e.preventDefault();
    e.stopPropagation();
    const unit = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? LINE_PX
      : e.deltaMode === WheelEvent.DOM_DELTA_PAGE ? node.clientHeight : 1;
    node.scrollTop += e.deltaY * unit;
  };
  window.addEventListener('wheel', onWheel, { capture: true, passive: false });

  return {
    // Wechselt der Inhalt, ohne dass der Tooltip verschwindet, begänne er sonst mittendrin.
    update(next: unknown) {
      if (next !== content) node.scrollTop = 0;
      content = next;
    },
    destroy() {
      window.removeEventListener('wheel', onWheel, { capture: true });
    },
  };
}
