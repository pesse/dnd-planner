/**
 * Fixture: Druide 2 → 3 mit „Zirkel des Landes".
 *
 * Referenzfall für die featureEffects-Eval. Erwartetes Kernverhalten — SEIT der
 * Rückführung des Merkmalstexts auf das Original („Whenever you finish a Long Rest,
 * choose one type of land …"): die Landart-Wahl ist KEINE Aufstiegs-Entscheidung, sie
 * fällt nach jeder langen Rast neu. Der Stufenaufstieg darf sie deshalb weder erfragen
 * noch protokollieren:
 *  - Call 1 (Analyse): KEINE Choice, nicht blockiert — stattdessen die Stufe-3-Zeile
 *    ALLER VIER Landarten als zu erdende Zauber.
 *  - Call C (Finalisierung, ohne aufgelöste Wahl): dieselben zwölf Zauber als Grant,
 *    ohne getroffene Entscheidung. „Vorbereitet" ist keine Aufstiegs-Information mehr —
 *    welche der vier Listen gilt, entscheidet der Spieler pro Rast am Tisch.
 *
 * WICHTIG — kein Drift zur Realität: die gewonnenen Merkmale werden über den ECHTEN
 * Produktionspfad geladen (`computeSubclassFeatures` → `getProgressionByKey` → Vault),
 * exakt wie der Aufstiegs-Assistent im `subclass-delta`-Schritt. Der an die KI gehende
 * Merkmalstext (EN, inkl. vollständiger Zaubertabelle) ist damit identisch zur App.
 * Vault-Reads laufen im Node-Eval über den fs-Shim (tests/support/tauriInvokeShim.ts).
 */
import type { CharacterSummary } from '../../src/lib/services/aiActions/levelUpAction';
import type { FeatureClassContext, GainedFeature } from '../../src/lib/services/aiActions/featureEffectsAction';
import { computeSubclassFeatures } from '../../src/lib/services/levelUpMachine';
import { withoutSpellGrantFeatures } from '../../src/lib/services/grantedSpells';

/** Open5e-v2-Key der Subklasse (wie am Charakter / im Delta). */
export const CIRCLE_OF_LAND_KEY = 'srd-2024_circle-of-the-land';

/** Stufenspanne des Referenzfalls (Druide 2 → 3, Subklasse wird auf 3 gewählt). */
export const FROM_LEVEL = 2;
export const TO_LEVEL = 3;

/**
 * Lädt die auf Stufe 3 neu gewonnenen Subklassen-Merkmale über die ECHTE Logik —
 * dieselbe Funktion, die der Assistent nach der Subklassen-Wahl aufruft. Liefert die
 * realen GainedFeature[] (EN-Name/-desc + key) aus dem Vault, ohne Handabschrift.
 *
 * `withoutSpellGrantFeatures` steht hier, weil der Assistent es an derselben Stelle tut
 * (`subclass-delta`): die immer-vorbereiteten Zauberlisten sind Tabellen im Merkmalstext und
 * werden deterministisch gelesen, gehen also NICHT mehr an das Modell. Ohne diesen Filter
 * würde die Strecke einen Eingang messen, den die App nicht mehr schickt.
 */
export async function loadCircleOfLandFeatures(): Promise<GainedFeature[]> {
  return withoutSpellGrantFeatures(await computeSubclassFeatures(CIRCLE_OF_LAND_KEY, FROM_LEVEL, TO_LEVEL));
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
 * Die vier Landarten (deutsche Begriffe aus `descDe`). NUR für weiche Prüfungen an der
 * Bogen-Notiz: die Notiz darf ruhig auf sie verweisen — die Wahl selbst ist Sache der
 * langen Rast, nicht des Aufstiegs.
 */
export const LAND_TYPES_DE = ['arid', 'polar', 'gemäßigt', 'tropisch'];

/**
 * Erwartete Kreissprüche auf Stufe 3 — die Zeile „Druid Level 3" ALLER VIER Landarten
 * (kanonische ENGLISCHE Namen aus den Zaubertabellen des Merkmals). Weil die Landart erst
 * pro langer Rast gewählt wird, gehört auf Stufe 3 die komplette Liste zum Charakter; was
 * davon jeweils vorbereitet ist, entscheidet die Rast.
 * Reihenfolge: arid, polar, gemäßigt (temperate), tropisch.
 */
export const EXPECTED_CIRCLE_SPELLS: string[] = [
  'Blur', 'Burning Hands', 'Fire Bolt',
  'Fog Cloud', 'Hold Person', 'Ray of Frost',
  'Misty Step', 'Shocking Grasp', 'Sleep',
  'Acid Splash', 'Ray of Sickness', 'Web',
];

/**
 * Dieselben Zauber mit ihren deutschen Bibliotheksnamen. Gebraucht für die Gegenprobe auf
 * der Bogen-Notiz: die Kreissprüche stehen bereits in der Zauberliste des Charakters und
 * dürfen das knappe Klassenmerkmale-Feld nicht zusätzlich füllen — die KI schreibt die
 * Notiz auf Deutsch, also muss der Check beide Sprachen abdecken.
 */
export const EXPECTED_CIRCLE_SPELLS_DE: string[] = [
  'Verschwimmen', 'Brennende Hände', 'Feuerpfeil',
  'Nebelwolke', 'Person festhalten', 'Kältestrahl',
  'Nebelschritt', 'Schockgriff', 'Schlaf',
  'Säurespritzer', 'Strahl der Übelkeit', 'Netz',
];

/**
 * Kreissprüche der Zeilen 5/7/9 aller vier Landarten — sie gehören auf Stufe 3 NOCH NICHT
 * dazu („for your Druid level and lower"). Negativprobe gegen das Abschreiben ganzer
 * Tabellen.
 */
export const TOO_HIGH_CIRCLE_SPELLS: string[] = [
  'Fireball', 'Blight', 'Wall of Stone',
  'Sleet Storm', 'Ice Storm', 'Cone of Cold',
  'Lightning Bolt', 'Freedom of Movement', 'Tree Stride',
  'Stinking Cloud', 'Polymorph', 'Insect Plague',
];
