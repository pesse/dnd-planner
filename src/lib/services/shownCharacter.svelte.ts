/** Ein Charakter mit gerechneten Kampfwerten, wie Bogen und Druck ihn zeigen — für Vorschauen. */
import type { Character } from '../schemas/characterSchema';
import { withShownCombatValues } from './combatFallbacks';

export function createShownCharacter(source: () => Character | null): { readonly current: Character | null } {
  let shown = $state<Character | null>(null);
  $effect(() => {
    const c = source();
    if (!c) { shown = null; return; }
    let cancelled = false;
    void withShownCombatValues(c).then((v) => { if (!cancelled) shown = v; });
    return () => { cancelled = true; };
  });
  return {
    /** Bis zur ersten Rechnung der Charakter selbst. */
    get current() { return shown ?? source(); },
  };
}
