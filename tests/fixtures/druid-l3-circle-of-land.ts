/**
 * Fixture: Druide 2 → 3 mit „Zirkel des Landes" — die Kreissprüche, die der Aufstieg aus
 * den deklarierten Tabellen liest.
 */

export const CIRCLE_OF_LAND_KEY = 'srd-2024_circle-of-the-land';

/**
 * Zeile „Druid Level 3" ALLER VIER Landarten (kanonische EN-Namen), Reihenfolge arid,
 * polar, gemäßigt, tropisch — auf Stufe 3 gehört die komplette Liste zum Charakter.
 */
export const EXPECTED_CIRCLE_SPELLS: string[] = [
  'Blur', 'Burning Hands', 'Fire Bolt',
  'Fog Cloud', 'Hold Person', 'Ray of Frost',
  'Misty Step', 'Shocking Grasp', 'Sleep',
  'Acid Splash', 'Ray of Sickness', 'Web',
];

/**
 * Zeilen 5/7/9 — auf Stufe 3 noch NICHT dabei („for your Druid level and lower").
 * Negativprobe gegen das Abschreiben ganzer Tabellen.
 */
export const TOO_HIGH_CIRCLE_SPELLS: string[] = [
  'Fireball', 'Blight', 'Wall of Stone',
  'Sleet Storm', 'Ice Storm', 'Cone of Cold',
  'Lightning Bolt', 'Freedom of Movement', 'Tree Stride',
  'Stinking Cloud', 'Polymorph', 'Insect Plague',
];
