/**
 * Die SL-Seite des Spielerfensters: schickt den Kartenstand höchstens einmal pro Frame und nimmt
 * Züge und Zustände der Spieler nur für Charaktere an, die sie gerade sehen dürfen.
 */
import type { BattleMap, Token } from '../../schemas/battleMap';
import type { Badge } from '../../conditionIcon';
import { onPlayerMessage, sendToPlayer, type ToGm } from './channel';
import { snapCell, type Point } from './geometry';
import { seenByPlayers, toPlayerState, type PlayerImages } from './playerState';
import { loadPlayerTips } from './playerTips';

export interface PlayerLinkHost {
  map(): BattleMap | null;
  images(): PlayerImages;
  /** `first`: der Beginn eines Zugs — dort gehört der Rückgängig-Punkt hin. */
  moveToken(id: string, at: Point, first: boolean): void;
  toggleBadge(id: string, badge: Badge): void;
}

export class PlayerLink {
  #host: PlayerLinkHost;
  #tips: Record<string, string> = {};
  #frame = 0;
  #drag: string | null = null;
  #unlisten: () => void;

  constructor(host: PlayerLinkHost) {
    this.#host = host;
    void loadPlayerTips().then((tips) => {
      this.#tips = tips;
      sendToPlayer({ type: 'tips', tips });
    });
    this.#unlisten = onPlayerMessage((msg) => this.#receive(msg));
  }

  destroy(): void {
    this.#unlisten();
    cancelAnimationFrame(this.#frame);
  }

  schedule(): void {
    cancelAnimationFrame(this.#frame);
    this.#frame = requestAnimationFrame(() => this.sendNow());
  }

  sendNow(): void {
    const map = this.#host.map();
    if (map) sendToPlayer({ type: 'state', state: toPlayerState(map, this.#host.images()) });
  }

  showHp(map: BattleMap, t: Token, delta: number): void {
    if (seenByPlayers(map, t)) sendToPlayer({ type: 'hp', id: t.id, delta });
  }

  #receive(msg: ToGm): void {
    if (msg.type === 'hello') {
      sendToPlayer({ type: 'tips', tips: this.#tips });
      this.sendNow();
      return;
    }
    // Das Fenster könnte einen veralteten Stand zeigen — deshalb hier erneut dieselbe Regel wie beim Senden.
    const map = this.#host.map();
    const t = map?.tokens.find((x) => x.id === msg.id);
    if (!map || !t || t.kind !== 'character' || !seenByPlayers(map, t)) return;
    if (msg.type === 'badge') {
      this.#host.toggleBadge(t.id, msg.badge);
      return;
    }
    const first = this.#drag !== t.id;
    this.#drag = msg.done ? null : t.id;
    const at = msg.done ? { x: snapCell(msg.x, t.size), y: snapCell(msg.y, t.size) } : { x: msg.x, y: msg.y };
    this.#host.moveToken(t.id, at, first);
  }
}
