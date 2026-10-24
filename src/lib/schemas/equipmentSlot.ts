/** Die Plätze am Körper, an denen ein angelegter Gegenstand sitzt, und wie viele je Platz passen. */
export const EQUIPMENT_SLOTS = [
  'head', 'eyes', 'neck', 'shoulders', 'body', 'arms', 'waist', 'feet', 'ring', 'hands', 'other',
] as const;
export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];

/** `hands` zählt Hände, nicht Gegenstände: eine Zweihandwaffe belegt beide. */
export const SLOT_CAPACITY: Record<EquipmentSlot, number> = {
  head: 1, eyes: 1, neck: 1, shoulders: 1, body: 1, arms: 1, waist: 1, feet: 1, ring: 2, hands: 2,
  other: Infinity,
};

export const SLOT_LABEL_DE: Record<EquipmentSlot, string> = {
  head: 'Kopf', eyes: 'Augen', neck: 'Hals', shoulders: 'Schultern', body: 'Körper', arms: 'Arme',
  waist: 'Gürtel', feet: 'Füße', ring: 'Ringe', hands: 'Hände', other: 'Sonstiges',
};
