/**
 * Fixture: Schurke 2 → 3 mit „Dieb" (Thief).
 *
 * Gegenprobe zum Druiden-Referenzfall: ein Aufstieg GANZ OHNE erzwungene Wahl und
 * ohne Zauber. Erwartetes Kernverhalten:
 *  - Call 1 (Analyse): keine Choices, keine zu erdenden Zauber, nicht blockiert.
 *  - Call C (Finalisierung): keine erfundenen Grants — kein Zauber, keine Expertise,
 *    keine Attributsboni, keine protokollierten Entscheidungen.
 *
 * Der Fall deckt außerdem den Wahl-Zeiger ab: das Klassenmerkmal „Rogue Subclass"
 * darf gar nicht erst bei der KI ankommen (die Subklasse ist am eigenen Checkpoint
 * längst gewählt) — `gainedFeaturesFor` filtert es deterministisch heraus.
 *
 * WICHTIG — kein Drift zur Realität: die Merkmale werden über den ECHTEN
 * Produktionspfad zusammengestellt, exakt wie der Assistent im `subclass-delta`-Schritt:
 * `computeLevelUpDelta` → `gainedFeaturesFor` (Klassenmerkmale) + `computeSubclassFeatures`
 * (Subklassen-Merkmale). Vault-Reads laufen im Node-Eval über den fs-Shim
 * (evals/setup/tauriInvokeShim.ts).
 */
import { characterSchema } from '../../src/lib/schemas/character';
import type { FeatureClassContext, GainedFeature } from '../../src/lib/services/aiActions/featureEffectsAction';
import { computeLevelUpDelta } from '../../src/lib/services/levelUp';
import { computeSubclassFeatures, gainedFeaturesFor } from '../../src/lib/services/levelUpMachine';

/** Open5e-v2-Keys von Grund- und Subklasse (wie am Charakter / im Delta). */
export const ROGUE_KEY = 'srd-2024_rogue';
export const THIEF_KEY = 'srd-2024_thief';

/** Stufenspanne des Falls (Schurke 2 → 3, Subklasse wird auf 3 gewählt). */
export const FROM_LEVEL = 2;
export const TO_LEVEL = 3;

/**
 * Charakter VOR dem Aufstieg: Schurke 2, noch ohne Subklasse — genau der Zustand, in
 * dem der Assistent startet. Über `characterSchema.parse` gebaut, damit alle übrigen
 * Felder ihre echten Defaults bekommen (das Delta liest ohnehin nur `classes`).
 */
const rogueBefore = characterSchema.parse({
  name: 'Vex Nachtschritt',
  classes: [{ sourceKey: ROGUE_KEY, name: 'Schurke', level: FROM_LEVEL }],
});

/**
 * Die auf Stufe 3 neu gewonnenen Merkmale über die ECHTE Logik — Klassenmerkmale aus
 * dem Delta (inkl. Filter der Wahl-Zeiger) plus die Merkmale der gewählten Subklasse,
 * in derselben Reihenfolge wie im Assistenten.
 */
export async function loadRogueThiefFeatures(): Promise<GainedFeature[]> {
  const delta = await computeLevelUpDelta(rogueBefore, 0, TO_LEVEL);
  const subFeatures = await computeSubclassFeatures(THIEF_KEY, FROM_LEVEL, TO_LEVEL);
  return [...gainedFeaturesFor(delta), ...subFeatures];
}

/**
 * Klassen-Kontext für featureEffects. Der Schurke ist Nicht-Zauberwirker; die Subklasse
 * steht hier, weil sie zum Zeitpunkt der Merkmals-Deutung bereits gewählt ist.
 */
export const rogueClassContext: FeatureClassContext = {
  klasseName: 'Schurke',
  subclassName: 'Dieb',
  casterType: 'NONE',
  casterKind: 'none',
  spellcastingAbility: '',
  toLevel: TO_LEVEL,
};

/** Merkmale, die auf Stufe 3 tatsächlich ankommen (SRD 5.2: Schurke + Dieb). */
export const EXPECTED_FEATURE_NAMES = ['Steady Aim', 'Fast Hands', 'Second-Story Work'];

/**
 * Dieselben Merkmale mit ihren deutschen Namen (`nameDe` im Vault). Die Bogen-Notiz ist
 * deutsch, die `featureName` der Rider dagegen englisch (so kommen sie im Input an) —
 * eine Notiz darf ihr Merkmal daher in beiden Sprachen benennen.
 */
export const EXPECTED_FEATURE_NAMES_DE = ['Ruhiges Zielen', 'Flinke Hände', 'Einbrucharbeit'];

/** Der Wahl-Zeiger, der NICHT bei der KI landen darf (deterministisch gefiltert). */
export const FILTERED_FEATURE_NAME = 'Rogue Subclass';
