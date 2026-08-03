/**
 * Tastatur-Navigation einer Autocomplete-Liste: ↓/↑ markieren, Esc schließt,
 * Enter übernimmt den markierten Treffer. Der markierte Index gehört der Fabrik,
 * die Trefferliste bleibt beim Aufrufer — jede Stelle hat eine andere Quelle.
 */
export function createSuggestNav<T>(o: {
  items: () => T[];
  pick: (item: T) => void;
  /** Enter OHNE markierten Treffer. Fehlt sie, tut Enter dann nichts. */
  enter?: () => void;
  /** Escape zusätzlich zum Zurücksetzen: die Liste schließt der Aufrufer. */
  escape?: () => void;
}) {
  let index = $state(-1);

  return {
    get index() {
      return index;
    },
    /** Maus-Hover darf die Markierung mitnehmen. */
    set index(value: number) {
      index = value;
    },
    reset() {
      index = -1;
    },
    onkeydown(e: KeyboardEvent) {
      const items = o.items();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        index = Math.min(index + 1, items.length - 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        index = Math.max(index - 1, -1);
      } else if (e.key === 'Escape') {
        index = -1;
        o.escape?.();
      } else if (e.key === 'Enter') {
        const hit = index >= 0 ? items[index] : undefined;
        if (hit) {
          e.preventDefault();
          o.pick(hit);
        } else {
          o.enter?.();
        }
      }
    },
  };
}
