/**
 * Auf- und zugeklappte Abschnitte einer Leiste, gemerkt in `localStorage`: die Leiste wird
 * beim Charakterwechsel neu montiert ({#key dirPath}) — lokaler Zustand wäre jedes Mal weg.
 */
export interface CollapsibleSections {
  isOpen(id: string): boolean;
  setCollapsed(id: string, value: boolean): void;
}

export function createCollapsibleSections(storageKey: string): CollapsibleSections {
  let collapsed = $state<Record<string, boolean>>(read());

  function read(): Record<string, boolean> {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
      return raw && typeof raw === 'object' ? (raw as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  }

  return {
    isOpen: (id) => !collapsed[id],
    setCollapsed(id, value) {
      if (collapsed[id] === value) return; // `ontoggle` feuert auch beim Setzen von außen
      collapsed = { ...collapsed, [id]: value };
      localStorage.setItem(storageKey, JSON.stringify(collapsed));
    },
  };
}
