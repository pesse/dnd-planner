/** Das eine Handout, das gerade im Spielerfenster liegt — unabhängig davon, ob eine Karte offen ist. */
import { onPlayerMessage, sendToPlayer, type ShownHandout } from '../battleMap/channel';
import { openPlayerWindow } from '../battleMap/playerWindow';

export const playerHandout = $state<{ current: ShownHandout | null }>({ current: null });

const fileOf = (url: string) => url.split('?')[0];

/** Vergleicht die Bilddatei, nicht den Abruf — `vaultFileUrl` hängt bei jedem Laden ein neues `?v=` an. */
export const isShownImage = (url: string): boolean =>
  !!url && !!playerHandout.current && fileOf(playerHandout.current.imageUrl) === fileOf(url);

let listening = false;

// Ein neu geöffnetes Spielerfenster meldet sich mit `hello` und bekäme das Handout sonst nie.
function listenOnce() {
  if (listening) return;
  listening = true;
  onPlayerMessage((msg) => {
    if (msg.type === 'hello' && playerHandout.current) sendToPlayer({ type: 'handout', handout: playerHandout.current });
  });
}

export async function showHandout(handout: ShownHandout): Promise<void> {
  listenOnce();
  playerHandout.current = handout;
  await openPlayerWindow();
  sendToPlayer({ type: 'handout', handout });
}

/** Blendet die Abschrift zum gezeigten Handout ein (`text`) oder wieder aus (leer). */
export function setHandoutText(text: string): void {
  if (!playerHandout.current) return;
  playerHandout.current = { ...playerHandout.current, text };
  sendToPlayer({ type: 'handout', handout: playerHandout.current });
}

export function hideHandout(): void {
  playerHandout.current = null;
  sendToPlayer({ type: 'handout', handout: null });
}
