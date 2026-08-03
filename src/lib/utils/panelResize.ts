/**
 * Spaltenbreite per Maus ziehen — die eine Fassung für alle Griffe der App.
 * Den Zustand (Breite, „ich ziehe gerade" für die abgeschaltete CSS-Transition)
 * hält der Aufrufer und bekommt ihn über `onWidth`/`ondone` gesetzt.
 */
export function dragPanelWidth(
  e: MouseEvent,
  o: {
    /** Breite beim Anfassen des Griffs. */
    start: number;
    min: number;
    max: number;
    /** true = Panel hängt am rechten Rand (nach links ziehen vergrößert). */
    invert?: boolean;
    onWidth: (w: number) => void;
    /** Nach dem Loslassen — Platz für `localStorage` und das Zurücksetzen des Flags. */
    ondone?: () => void;
  },
): void {
  e.preventDefault();
  const startX = e.clientX;

  function onMove(mv: MouseEvent) {
    const delta = o.invert ? startX - mv.clientX : mv.clientX - startX;
    o.onWidth(Math.max(o.min, Math.min(o.max, o.start + delta)));
  }

  function onUp() {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    o.ondone?.();
  }

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}
