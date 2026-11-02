/**
 * Draht zwischen SL- und Spielerfenster: Tauri-Events in der App, `BroadcastChannel` im
 * Browser-Dev. Die SL sendet Zustand; das Spielerfenster fragt ihn mit `hello` an und meldet
 * gezogene Tokens (`done` beim Loslassen).
 */
import { emit, listen } from '@tauri-apps/api/event';
import { isTauri } from '../httpFetch';
import type { PlayerState } from './playerState';

export type ToPlayer = { type: 'state'; state: PlayerState };
export type ToGm = { type: 'hello' } | { type: 'move'; id: string; x: number; y: number; done: boolean };

const TO_PLAYER = 'battlemap-to-player';
const TO_GM = 'battlemap-to-gm';

type Unlisten = () => void;

function send<T>(topic: string, msg: T): void {
  if (isTauri()) {
    void emit(topic, msg);
    return;
  }
  const ch = new BroadcastChannel(topic);
  ch.postMessage(msg);
  ch.close();
}

function subscribe<T>(topic: string, handler: (msg: T) => void): Unlisten {
  if (isTauri()) {
    const pending = listen<T>(topic, (e) => handler(e.payload));
    return () => void pending.then((un) => un());
  }
  const ch = new BroadcastChannel(topic);
  ch.onmessage = (e) => handler(e.data as T);
  return () => ch.close();
}

export const sendToPlayer = (msg: ToPlayer): void => send(TO_PLAYER, msg);
export const sendToGm = (msg: ToGm): void => send(TO_GM, msg);
export const onPlayerMessage = (h: (msg: ToGm) => void): Unlisten => subscribe(TO_GM, h);
export const onGmMessage = (h: (msg: ToPlayer) => void): Unlisten => subscribe(TO_PLAYER, h);
