/** Die Plätze am Körper, an denen ein angelegter Gegenstand sitzt. */
export const EQUIPMENT_SLOTS = [
  'head', 'eyes', 'neck', 'shoulders', 'back', 'body', 'arms', 'ring', 'waist',
  'hipRight', 'hipLeft', 'boot', 'feet', 'other',
] as const;
export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];

/** Wie viel die automatische Verteilung an einen Platz hängt, bevor sie zum nächsten greift. Kein Limit für den Spieler. */
export const SLOT_ROOM: Record<EquipmentSlot, number> = {
  head: 1, eyes: 1, neck: Infinity, shoulders: 1, back: 3, body: 1, arms: Infinity, ring: Infinity, waist: 1,
  hipRight: 2, hipLeft: 2, boot: 2, feet: 1, other: Infinity,
};

/** Von diesen Stücken trägt man nach den Regeln (DMG) nur eins zur Zeit. */
export const SINGLE_WEAR: ReadonlySet<EquipmentSlot> = new Set(['head', 'shoulders', 'body', 'feet']);

export const SLOT_LABEL_DE: Record<EquipmentSlot, string> = {
  head: 'Kopf', eyes: 'Augen', neck: 'Hals', shoulders: 'Schultern', back: 'Rücken', body: 'Körper',
  arms: 'Arme', ring: 'Ringe', waist: 'Gürtel', hipRight: 'Gürtel rechts', hipLeft: 'Gürtel links',
  boot: 'Stiefelschaft', feet: 'Füße', other: 'Sonstiges',
};
