/** Augenzwinkernde Kommentare zur Figur: Was die Regeln oder die Physik zu einem Platz sagen, verbietet nichts. */
import { SINGLE_WEAR, SLOT_ROOM, type EquipmentSlot } from '../schemas/equipmentSlot';
import type { SlotFill } from './equipmentSlots';

const ONE_AT_A_TIME: Partial<Record<EquipmentSlot, (n: number) => string>> = {
  head: () => 'Ein Turm von beachtlicher Statik. Laut Regelwerk wirkt nur eins davon.',
  shoulders: (n) => n > 2
    ? 'Du siehst aus wie eine sehr elegante Zwiebel, und das Regelwerk lässt nur einen Umhang wirken.'
    : 'Flattert dramatisch im Wind. Der Barde ist neidisch, das Regelwerk lässt nur einen wirken.',
  body: () => 'Du schepperst wie eine Schmiede im Erdbeben. Für die RK zählt nur eine Rüstung.',
  feet: () => 'Respekt vor der Logistik. Wirken tut nur ein Paar.',
};

const CROWDED: Partial<Record<EquipmentSlot, string>> = {
  back: 'Du klapperst wie ein reisender Waffenhändler. Schleichen wird spannend.',
  hipRight: 'Der Gürtel hält, die Hose betet.',
  hipLeft: 'Der Gürtel hält, die Hose betet.',
  boot: 'Jeder Schritt ist eine kleine Mutprobe.',
};

const PLENTY: Partial<Record<EquipmentSlot, [number, string]>> = {
  ring: [10, 'Mehr Ringe als Finger. Zehen sind auch Finger, irgendwie.'],
  neck: [3, 'Ein Drache würde dich glatt für seinen Hort halten.'],
};

/** Je Platz höchstens ein Kommentar. */
export function equipmentQuips(fills: ReadonlyMap<EquipmentSlot, SlotFill>): Map<EquipmentSlot, string> {
  const quips = new Map<EquipmentSlot, string>();
  for (const f of fills.values()) {
    const n = f.items.length;
    const plenty = PLENTY[f.slot];
    if (SINGLE_WEAR.has(f.slot) && n > 1) quips.set(f.slot, ONE_AT_A_TIME[f.slot]!(n));
    else if (CROWDED[f.slot] && n > SLOT_ROOM[f.slot]) quips.set(f.slot, CROWDED[f.slot]!);
    else if (plenty && n > plenty[0]) quips.set(f.slot, plenty[1]);
  }
  return quips;
}
