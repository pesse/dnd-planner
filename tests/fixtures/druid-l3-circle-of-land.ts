/**
 * Fixture: Druide 2 → 3 mit „Zirkel des Landes", Referenzfall der featureEffects-Eval.
 *
 * Die Landart-Wahl ist KEINE Aufstiegs-Entscheidung — sie fällt nach jeder langen Rast neu
 * („Whenever you finish a Long Rest, choose one type of land …"). Der Aufstieg darf sie
 * deshalb weder erfragen noch protokollieren:
 *  - Call 1 (Analyse): keine Choice, nicht blockiert — stattdessen die Stufe-3-Zeile
 *    ALLER VIER Landarten als zu erdende Zauber.
 *  - Call C: dieselben zwölf Zauber als Grant, ohne getroffene Entscheidung.
 *
 * Die Merkmale kommen über den ECHTEN Produktionspfad (`computeSubclassFeatures` → Vault),
 * damit der Merkmalstext identisch zu dem der App ist; Vault-Reads über den fs-Shim.
 */
import type { CharacterSummary } from '../../src/lib/services/aiActions/levelUpAction';
import type { FeatureClassContext, GainedFeature } from '../../src/lib/services/analysis/types';
import { computeSubclassFeatures } from '../../src/lib/services/levelUp/features';
import { withoutSpellGrantFeatures } from '../../src/lib/services/grantedSpells';

export const CIRCLE_OF_LAND_KEY = 'srd-2024_circle-of-the-land';

export const FROM_LEVEL = 2;
export const TO_LEVEL = 3;

/**
 * `withoutSpellGrantFeatures` steht hier, weil der Assistent es an derselben Stelle tut
 * (`subclass-delta`): die immer-vorbereiteten Zauberlisten werden deterministisch aus den
 * Tabellen gelesen. Ohne den Filter misst die Strecke einen Eingang, den die App nicht schickt.
 */
export async function loadCircleOfLandFeatures(): Promise<GainedFeature[]> {
  return withoutSpellGrantFeatures(await computeSubclassFeatures(CIRCLE_OF_LAND_KEY, FROM_LEVEL, TO_LEVEL));
}

/** featureEffects braucht sie NICHT (nur Klassen-Kontext + Prosa), die levelUp-Pässe schon. */
export const druidSummary: CharacterSummary = {
  name: 'Thalia Eichenschild',
  classes: [{ name: 'Druide', level: 3, subclassName: 'Zirkel des Landes' }],
  totalLevel: 3,
  abilities: { str: 10, ges: 14, kon: 14, int: 12, wei: 16, cha: 10 },
  mods: { str: 0, ges: 2, kon: 2, int: 1, wei: 3, cha: 0 },
  hitDice: '3d8',
  spellcasting: { class: 'Druide', ability: 'wei', currentSlots: [4, 2] },
};

/**
 * Konstante statt geladen: das sind Charakter-Fakten, keine driftgefährdete Merkmals-Prosa.
 * Der Assistent leitet dieselben Werte aus Basisklassen-Delta + Charakterblatt ab.
 */
export const druidClassContext: FeatureClassContext = {
  klasseName: 'Druide',
  subclassName: 'Zirkel des Landes',
  casterType: 'FULL',
  casterKind: 'prepared',
  spellcastingAbility: 'wei',
  toLevel: TO_LEVEL,
};

/** Aus `descDe`. Nur für weiche Prüfungen: die Notiz DARF auf die Landarten verweisen. */
export const LAND_TYPES_DE = ['arid', 'polar', 'gemäßigt', 'tropisch'];

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
 * Gegenprobe auf der Bogen-Notiz: die Kreissprüche stehen schon in der Zauberliste und
 * dürfen das knappe Merkmalsfeld nicht füllen. Die KI schreibt deutsch — beide Sprachen nötig.
 */
export const EXPECTED_CIRCLE_SPELLS_DE: string[] = [
  'Verschwimmen', 'Brennende Hände', 'Feuerpfeil',
  'Nebelwolke', 'Person festhalten', 'Kältestrahl',
  'Nebelschritt', 'Schockgriff', 'Schlaf',
  'Säurespritzer', 'Strahl der Übelkeit', 'Netz',
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
