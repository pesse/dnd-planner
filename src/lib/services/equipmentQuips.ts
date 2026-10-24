/** Augenzwinkernde Kommentare zur Figur: Was die Regeln oder die Physik zu einem Platz sagen, verbietet nichts. */
import { displayName } from '../itemLibrary';
import { SINGLE_WEAR, SLOT_ROOM, type EquipmentSlot } from '../schemas/equipmentSlot';
import type { SlotFill } from './equipmentSlots';

const list = (f: SlotFill): string => {
  const names = f.items.map((p) => displayName(p.item));
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} und ${names.at(-1)}` : names[0];
};

const ONE_AT_A_TIME: Partial<Record<EquipmentSlot, (f: SlotFill) => string>> = {
  head: (f) => `${list(f)} übereinander auf dem Kopf: ein Turm von beachtlicher Statik. Laut Regelwerk wirkt nur eins davon.`,
  shoulders: (f) => f.items.length > 2
    ? `${f.items.length} Umhänge übereinander. Du siehst aus wie eine sehr elegante Zwiebel, und das Regelwerk lässt nur einen wirken.`
    : `${list(f)} flattern gemeinsam dramatisch im Wind. Der Barde ist neidisch, das Regelwerk lässt nur einen wirken.`,
  body: (f) => `${list(f)} übereinander: Du schepperst wie eine Schmiede im Erdbeben. Für die RK zählt nur eine Rüstung.`,
  feet: (f) => `${list(f)} gleichzeitig an den Füßen? Respekt vor der Logistik. Wirken tut nur ein Paar.`,
};

const CROWDED: Partial<Record<EquipmentSlot, (n: number) => string>> = {
  back: (n) => `${n} Stücke auf dem Rücken: Du klapperst wie ein reisender Waffenhändler. Schleichen wird spannend.`,
  hipRight: (n) => `${n} Stücke am Gürtel rechts: Der Gürtel hält, die Hose betet.`,
  hipLeft: (n) => `${n} Stücke am Gürtel links: Der Gürtel hält, die Hose betet.`,
  boot: (n) => `${n} Dolche im Stiefelschaft: Jeder Schritt ist eine kleine Mutprobe.`,
};

const PLENTY: Partial<Record<EquipmentSlot, [number, (n: number) => string]>> = {
  ring: [10, (n) => `${n} Ringe bei zehn Fingern. Zehen sind auch Finger, irgendwie.`],
  neck: [3, (n) => `${n} Ketten um den Hals: Ein Drache würde dich glatt für seinen Hort halten.`],
};

export function equipmentQuips(fills: ReadonlyMap<EquipmentSlot, SlotFill>): string[] {
  return [...fills.values()].flatMap((f) => {
    const n = f.items.length;
    const plenty = PLENTY[f.slot];
    if (SINGLE_WEAR.has(f.slot) && n > 1) return [ONE_AT_A_TIME[f.slot]!(f)];
    if (CROWDED[f.slot] && n > SLOT_ROOM[f.slot]) return [CROWDED[f.slot]!(n)];
    if (plenty && n > plenty[0]) return [plenty[1](n)];
    return [];
  });
}
