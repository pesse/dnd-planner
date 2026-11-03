/** Kurz aufsteigende Zahlen über einem Token, wenn es Schaden nimmt oder geheilt wird. */
export interface HpPop {
  key: number;
  tokenId: string;
  delta: number;
}

/** Muss zur Animationsdauer von `.pop` in `MapStage.svelte` passen. */
const SHOWN_MS = 1800;

let next = 1;
export const hpPops = $state<{ list: HpPop[] }>({ list: [] });

export function popHp(tokenId: string, delta: number): void {
  if (!delta) return;
  const key = next++;
  hpPops.list.push({ key, tokenId, delta });
  setTimeout(() => (hpPops.list = hpPops.list.filter((p) => p.key !== key)), SHOWN_MS);
}
