/** Die Plätze am Körper, an denen ein angelegter Gegenstand sitzt, und wie viele je Platz passen. */
export const EQUIPMENT_SLOTS = [
  'head', 'eyes', 'neck', 'shoulders', 'back', 'body', 'arms', 'ring', 'waist',
  'hipRight', 'hipLeft', 'boot', 'feet', 'other',
] as const;
export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];

export const SLOT_CAPACITY: Record<EquipmentSlot, number> = {
  head: 1, eyes: 1, neck: 1, shoulders: 1, back: 2, body: 1, arms: 1, ring: 8, waist: 1,
  hipRight: 1, hipLeft: 1, boot: 2, feet: 1, other: Infinity,
};

export const SLOT_LABEL_DE: Record<EquipmentSlot, string> = {
  head: 'Kopf', eyes: 'Augen', neck: 'Hals', shoulders: 'Schultern', back: 'Rücken', body: 'Körper',
  arms: 'Arme', ring: 'Ringe', waist: 'Gürtel', hipRight: 'Gürtel rechts', hipLeft: 'Gürtel links',
  boot: 'Stiefelschaft', feet: 'Füße', other: 'Sonstiges',
};
