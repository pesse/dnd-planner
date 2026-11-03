/** Angeheftete Tooltips der Karte: frei verschiebbare Fenster mit Regeltext. */
export interface PinnedTip {
  id: number;
  text: string;
  x: number;
  y: number;
}

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
