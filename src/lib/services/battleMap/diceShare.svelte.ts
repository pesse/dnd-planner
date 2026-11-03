/** Spiegelt den letzten Wurf ins Spielerfenster, solange die SL ihre Würfe teilt. */
import { onPlayerMessage, sendToPlayer } from './channel';
import { diceLog } from './diceLog.svelte';
import { diceTray } from './diceTray.svelte';

export function shareDice(): () => void {
  const send = () => {
    const shown = diceTray.shared;
    sendToPlayer({ type: 'dice', shown, roll: shown ? ($state.snapshot(diceLog.rolls[0]) ?? null) : null });
  };
  const stop = $effect.root(() => {
    $effect(send);
  });
  const unlisten = onPlayerMessage((msg) => msg.type === 'hello' && send());
  return () => {
    stop();
    unlisten();
    sendToPlayer({ type: 'dice', shown: false, roll: null });
  };
}
