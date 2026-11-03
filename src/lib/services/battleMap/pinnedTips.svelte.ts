/** Angeheftete Tooltips der Karte: frei verschiebbare Fenster mit Regeltext. */
export interface PinnedTip {
  id: number;
  text: string;
  x: number;
  y: number;
}

const HEADER_PX = 21;

let next = 1;
export const pinnedTips = $state<{ list: PinnedTip[] }>({ list: [] });

export function pinTip(text: string, x: number, y: number): void {
  const open = pinnedTips.list.find((p) => p.text === text);
  if (open) return void Object.assign(open, { x, y });
  pinnedTips.list.push({ id: next++, text, x, y });
}

export function unpinTip(id: number): void {
  pinnedTips.list = pinnedTips.list.filter((p) => p.id !== id);
}

/** Wo der Schwebe-Tooltip gerade steht — dort bleibt das Fenster stehen; ohne Tooltip am Zeiger. */
export function tooltipSpot(e: MouseEvent): { x: number; y: number } {
  const tips = document.querySelectorAll<HTMLElement>('.text-tooltip');
  const box = tips[tips.length - 1]?.getBoundingClientRect();
  // Die Kopfleiste des Fensters sitzt über dem Text, der Text bleibt so an seinem Platz.
  return box ? { x: box.left, y: Math.max(0, box.top - HEADER_PX) } : { x: e.clientX + 12, y: e.clientY + 12 };
}
