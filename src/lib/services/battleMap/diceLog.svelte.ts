/** Verlauf der Würfel-Box; der Schaden-/Heilungsdialog übernimmt daraus den letzten Wurf. */
export interface Roll {
  id: number;
  /** Zum erneuten Würfeln per Klick auf den Verlauf; bei Vorteil/Nachteil leer. */
  formula: string;
  label: string;
  dice: { sides: number; value: number }[];
  kept: number | null;
  bonus: number;
  total: number;
  crit: 'hit' | 'miss' | null;
  /** So viele führende Würfel lagen schon (Strg+Klick addiert) und rollen nicht noch einmal. */
  landed?: number;
}

const LIMIT = 12;

export const diceLog = $state<{ rolls: Roll[] }>({ rolls: [] });

let nextId = 0;

export function logRoll(roll: Omit<Roll, 'id'>): void {
  diceLog.rolls = [{ id: nextId++, ...roll }, ...diceLog.rolls].slice(0, LIMIT);
}
