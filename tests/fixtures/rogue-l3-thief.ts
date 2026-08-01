/**
 * Fixture: Schurke 2 → 3 mit „Dieb" — Gegenprobe zum Druiden: ein Aufstieg ganz OHNE
 * erzwungene Wahl und ohne Zauber. Call 1 darf nichts fragen und nicht blockieren, Call C
 * nichts erfinden (kein Zauber, keine Expertise, kein Attributsbonus).
 *
 * Dazu der Wahl-Zeiger: „Rogue Subclass" darf gar nicht erst bei der KI ankommen — die
 * Subklasse ist am eigenen Checkpoint längst gewählt, `gainedFeaturesFor` filtert sie.
 * Zusammengestellt über den ECHTEN Produktionspfad des `subclass-delta`-Schritts.
 */
import { characterSchema } from '../../src/lib/schemas/characterSchema';
import type { FeatureClassContext, GainedFeature } from '../../src/lib/services/analysis/types';
import { computeLevelUpDelta } from '../../src/lib/services/levelUp';
import { computeSubclassFeatures, gainedFeaturesFor } from '../../src/lib/services/levelUp/features';

export const ROGUE_KEY = 'srd-2024_rogue';
export const THIEF_KEY = 'srd-2024_thief';

export const FROM_LEVEL = 2;
export const TO_LEVEL = 3;

/**
 * Zustand, in dem der Assistent startet: Schurke 2, noch ohne Subklasse. Über
 * `characterSchema.parse`, damit die übrigen Felder ihre echten Defaults bekommen.
 */
const rogueBefore = characterSchema.parse({
  name: 'Vex Nachtschritt',
  classes: [{ sourceKey: ROGUE_KEY, name: 'Schurke', level: FROM_LEVEL }],
});

/** Reihenfolge wie im Assistenten: Klassenmerkmale aus dem Delta, dann die der Subklasse. */
export async function loadRogueThiefFeatures(): Promise<GainedFeature[]> {
  const delta = await computeLevelUpDelta(rogueBefore, 0, TO_LEVEL);
  const subFeatures = await computeSubclassFeatures(THIEF_KEY, FROM_LEVEL, TO_LEVEL);
  return [...gainedFeaturesFor(delta), ...subFeatures];
}

/** Die Subklasse steht hier, weil sie zur Merkmals-Deutung bereits gewählt ist. */
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
 * `nameDe` aus dem Vault: die Bogen-Notiz ist deutsch, `featureName` der Rider englisch —
 * eine Notiz darf ihr Merkmal deshalb in beiden Sprachen benennen.
 */
export const EXPECTED_FEATURE_NAMES_DE = ['Ruhiges Zielen', 'Flinke Hände', 'Einbrucharbeit'];

/** Der Wahl-Zeiger, der NICHT bei der KI landen darf (deterministisch gefiltert). */
export const FILTERED_FEATURE_NAME = 'Rogue Subclass';
