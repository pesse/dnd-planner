/** Ziehbare Position für nicht-blockierende Dialoge. */
import { onDestroy } from 'svelte';

export function createDragDialog(top = 80) {
  let pos = $state({ x: Math.max(16, window.innerWidth / 2 - 280), y: top });
  let dragOff = { x: 0, y: 0 };
  let dragging = false;

  function onDrag(e: MouseEvent) {
    if (!dragging) return;
    pos = {
      x: Math.min(Math.max(0, e.clientX - dragOff.x), window.innerWidth - 80),
      y: Math.min(Math.max(0, e.clientY - dragOff.y), window.innerHeight - 40),
    };
  }

  function endDrag() {
    dragging = false;
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('mouseup', endDrag);
  }

  function startDrag(e: MouseEvent) {
    dragging = true;
    dragOff = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    window.addEventListener('mousemove', onDrag);
    window.addEventListener('mouseup', endDrag);
    e.preventDefault();
  }

  onDestroy(endDrag);

  return {
    get pos() {
      return pos;
    },
    startDrag,
  };
}
