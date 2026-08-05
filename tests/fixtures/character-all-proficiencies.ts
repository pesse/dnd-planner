/**
 * Ein Bogen, auf dem JEDE Übungs-Senke etwas zu zeigen hat: beide Waffenkategorien, eine
 * einzeln erklärte Waffe, der Freitext daneben, alle vier Rüstungs-Häkchen, Beherrschungen,
 * Werkzeuge und Sprachen — dazu Fertigkeiten mit und ohne Expertise, Zauber, Inventar.
 *
 * Ohne Bibliotheks-Links (`classes`/`species`/`features` leer), damit die Projektionen ohne
 * Vault-Auflösung vergleichbar bleiben.
 */
import { characterSchema } from '../../src/lib/schemas/characterSchema';

export const allProficienciesCharacter = characterSchema.parse({
  name: 'Miriel Sturmklinge',
  playerName: 'Ada',
  classLevel: 'Paladin 5',
  background: 'Adlige',
  race: 'Halbelf',
  xp: '6500',
  abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 13, cha: 18 },
  mods: { str: 3, dex: 1, con: 2, int: 0, wis: 1, cha: 4 },
  ac: '18',
  initiative: '+1',
  speed: '9 m',
  hpMax: '44',
  hpCurrent: '38',
  hpTemp: '5',
  proficiencyBonus: 3,
  passivePerception: '11',
  hitDice: '5W10',
  saveProfs: { str: false, dex: false, con: false, int: false, wis: true, cha: true },
  skills: {
    Athletik: { value: 6, prof: true, exp: false },
    Einschüchtern: { value: 10, prof: true, exp: true },
    Überzeugen: { value: 7, prof: true, exp: false },
    Wahrnehmung: { value: 1, prof: false, exp: false },
  },
  attacks: [
    { name: 'Langschwert', bonus: '+6', damage: '1W8+3', type: 'Hieb', range: 'Nahkampf' },
  ],
  classFeatures: 'Göttliches Machtwort: 5 Punkte Heilung je lange Rast.',
  traits: 'Spricht leise und langsam.',
  ideals: 'Ein gegebenes Wort wiegt schwerer als ein Schwert.',
  bonds: 'Dem Orden von Sankt Aldric verpflichtet.',
  flaws: 'Vergibt sich selbst nichts.',
  languages: ['Gemeinsprache', 'Elfisch', 'Zwergisch'],
  tools: ['Schmiedewerkzeug', 'Würfelspiel'],
  alleskoenner: true,
  currency: { km: '12', sm: '8', em: '0', gm: '150', pm: '' },
  inventory: [
    { name: 'Langschwert', count: '1', weight: '1,5' },
    { name: 'Kettenhemd', count: '1', weight: '27,5' },
    { name: 'Fackel', count: '5', weight: '0,5' },
  ],
  inventoryNotes: 'Das Kettenhemd trägt das Wappen des Ordens.',
  spells: {
    spellcastingClass: 'Paladin',
    spellcastingAbility: 'Charisma',
    saveDC: 15,
    attackBonus: 7,
    slots: [
      { total: 4, used: 1 },
      { total: 2, used: 0 },
      { total: 0, used: 0 },
      { total: 0, used: 0 },
      { total: 0, used: 0 },
      { total: 0, used: 0 },
      { total: 0, used: 0 },
      { total: 0, used: 0 },
      { total: 0, used: 0 },
    ],
    cantrips: [{ name: 'Licht' }],
    byLevel: {
      '1': [
        { name: 'Göttliche Gunst', prepared: true },
        { name: 'Heldentum', prepared: false },
      ],
      '2': [{ name: 'Waffe des Glaubens', prepared: true }],
    },
  },
  personal: {
    alter: '34',
    geschlecht: 'weiblich',
    gesinnung: 'Rechtschaffen Gut',
    sizeCat: 'Mittelgroß',
    koerpergroesse: '1,78 m',
  },
  proficiencies: {
    simpleWeapons: true,
    martialWeapons: true,
    individualWeapons: ['Kurzschwert'],
    otherWeapons: 'Kriegswaffen mit Finesse',
    lightArmor: true,
    mediumArmor: true,
    heavyArmor: true,
    shields: true,
  },
  masteries: ['Langschwert', 'Kurzschwert'],
});

/** Die Wahl-Zeilen, die der Aufstieg dem Protokoll von außen mitgibt. */
export const allProficienciesDecisions = [
  { question: 'Kampfstil', answer: 'Verteidigung' },
  { question: '', answer: 'Eid der Hingabe' },
  { question: 'Nicht beantwortet', answer: '  ' },
];
