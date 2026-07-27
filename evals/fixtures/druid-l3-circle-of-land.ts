/**
 * Fixture: Druide 2 → 3 mit „Zirkel des Landes".
 *
 * Referenzfall für die featureEffects-Eval. Erwartetes Kernverhalten:
 *  - 1. Pass (ohne aufgelöste Wahl): die KI liefert eine Landart-Auswahl als
 *    choicePrompt mit resolvesEffects=true — die Kreissprüche hängen von der Wahl ab,
 *    daher noch KEINE grantedSpells.
 *  - 2. Pass (Landart aufgelöst): die KI liefert die konkreten Kreissprüche als
 *    grantedSpells und hält die Wahl mit resolvesEffects=false fest.
 *
 * WICHTIG — kein Drift zur Realität: die gewonnenen Merkmale werden über den ECHTEN
 * Produktionspfad geladen (`computeSubclassFeatures` → `getProgressionByKey` → Vault),
 * exakt wie der Aufstiegs-Assistent im `subclass-delta`-Schritt. Der an die KI gehende
 * Merkmalstext (EN, inkl. vollständiger Zaubertabelle) ist damit identisch zur App.
 * Vault-Reads laufen im Node-Eval über den fs-Shim (evals/setup/tauriInvokeShim.ts).
 */
import type { CharacterSummary } from '../../src/lib/services/aiActions/levelUpAction';
import type { FeatureClassContext, GainedFeature } from '../../src/lib/services/aiActions/featureEffectsAction';
import { computeSubclassFeatures } from '../../src/lib/services/levelUpMachine';

/** Open5e-v2-Key der Subklasse (wie am Charakter / im Delta). */
export const CIRCLE_OF_LAND_KEY = 'srd-2024_circle-of-the-land';

/** Stufenspanne des Referenzfalls (Druide 2 → 3, Subklasse wird auf 3 gewählt). */
export const FROM_LEVEL = 2;
export const TO_LEVEL = 3;

/**
 * Lädt die auf Stufe 3 neu gewonnenen Subklassen-Merkmale über die ECHTE Logik —
 * dieselbe Funktion, die der Assistent nach der Subklassen-Wahl aufruft. Liefert die
 * realen GainedFeature[] (EN-Name/-desc + key) aus dem Vault, ohne Handabschrift.
 */
export function loadCircleOfLandFeatures(): Promise<GainedFeature[]> {
  return computeSubclassFeatures(CIRCLE_OF_LAND_KEY, FROM_LEVEL, TO_LEVEL);
}

/**
 * Charakter-Zusammenfassung des Referenzfalls. featureEffects braucht sie NICHT
 * (nur Klassen-Kontext + Merkmals-Prosa), levelUp-Pässe (Narrativ) hingegen schon.
 */
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
 * Klassen-Kontext für featureEffects. Bewusst als kleine, stabile Konstante gehalten:
 * es sind Charakter-/Klassen-Fakten (Druide = FULL/prepared-Caster, Zauberattribut
 * Weisheit), keine driftgefährdete Merkmals-Prosa. Der Assistent leitet dieselben
 * Werte aus dem Basisklassen-Delta + Charakterblatt ab.
 */
export const druidClassContext: FeatureClassContext = {
  klasseName: 'Druide',
  subclassName: 'Zirkel des Landes',
  casterType: 'FULL',
  casterKind: 'prepared',
  spellcastingAbility: 'wei',
  toLevel: TO_LEVEL,
};

/**
 * Kanonische Landarten, welche die Optionen der Landart-Auswahl abdecken sollten
 * (SRD 5.2 / 2024). NUR für die weiche „options cover expected"-Assertion.
 */
export const EXPECTED_LAND_TYPES = ['arid', 'polar', 'temperate', 'tropical', 'trocken', 'gemäßigt', 'tropisch'];

/** Landart, die im 2. Pass als getroffene Wahl übergeben wird (→ Temperate Land). */
export const RESOLVED_LAND = 'Gemäßigt';

/**
 * Erwartete immer-vorbereitete Kreissprüche für die gewählte Landart (RESOLVED_LAND
 * = „Gemäßigt" → Temperate Land) auf Stufe 3 (kanonische ENGLISCHE Namen aus der
 * Zaubertabelle des Merkmals; auf Stufe 3 greift nur die Zeile „Druid Level 3").
 * Leer ⇒ es wird nur geprüft, dass ÜBERHAUPT Kreissprüche gewährt wurden.
 */
export const EXPECTED_CIRCLE_SPELLS: string[] = ['Misty Step', 'Shocking Grasp', 'Sleep'];
