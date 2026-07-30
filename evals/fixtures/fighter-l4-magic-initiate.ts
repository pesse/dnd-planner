/**
 * Fixture: Kämpfer 3 → 4 (Champion), Attributsverbesserung als TALENT genommen —
 * „Eingeweihter der Magie".
 *
 * Warum dieser Fall: auf Stufe 4 bringt der Kämpfer nur die Attributsverbesserung, und die
 * ist ein Wahl-Zeiger (`isFlowOwnedChoiceFeature`). Der Merkmals-Eingang ist damit LEER — die
 * einzige KI-Arbeit des ganzen Aufstiegs ist der Talent-Pfad. Der Fall isoliert also genau
 * die Strecke, um die es geht, und der Kämpfer ist Nicht-Zauberwirker: was das Talent gewährt,
 * ist die einzige Magie am Bogen.
 *
 * WICHTIG — kein Drift zur Realität: Delta und Talent kommen über den ECHTEN Produktionspfad
 * (`computeLevelUpDelta`, `getFeats`), das Talent wird mit `featToGainedFeature` normalisiert,
 * genau wie `LevelUpAssistant.featuresFor('feat')` es tut. Vault-Reads laufen im Node-Eval
 * über den fs-Shim (evals/setup/tauriInvokeShim.ts).
 */
import { characterSchema } from '../../src/lib/schemas/character';
import { getFeats, featDisplayName, type FeatEntry } from '../../src/lib/featsLibrary';
import { computeLevelUpDelta, type LevelUpDelta } from '../../src/lib/services/levelUp';
import type { FeatureClassContext, GainedFeature } from '../../src/lib/services/aiActions/featureEffectsAction';
import { featToGainedFeature, gainedFeaturesFor } from '../../src/lib/services/levelUpMachine';

export const FIGHTER_KEY = 'srd-2024_fighter';
export const CHAMPION_KEY = 'srd-2024_champion';
export const MAGIC_INITIATE_KEY = 'srd-2024_magic-initiate';

export const FROM_LEVEL = 3;
export const TO_LEVEL = 4;

// ── Was der Vault DEKLARIERT (`grantsChoice.kind === "spellAccess"`) ────────────────
// Diese vier Zahlen/Listen sind die Erwartung an BEIDE Pfade: der deklarierte liest sie,
// der KI-Pfad müsste sie aus derselben Prosa wiederfinden.
export const DECLARED_LISTS = ['cleric', 'druid', 'wizard'] as const;
export const DECLARED_ABILITIES = ['Intelligence', 'Wisdom', 'Charisma'] as const;
/** Das Kontingent — `max: 1` für die Zaubertricks kostet den Charakter still einen Trick. */
export const CANTRIP_COUNT = 2;
export const LEVEL1_COUNT = 1;
/** Die im Eval getroffene Listen-Wahl (im Aufstieg gibt kein Hintergrund sie vor). */
export const CHOSEN_LIST = 'wizard';

/** Erwartete Anzahl Wahlen: Liste, Zauberattribut, Zaubertricks, Grad-1-Zauber. */
export const EXPECTED_CHOICE_COUNT = 4;

/**
 * Charakter VOR dem Aufstieg: Kämpfer 3 mit Champion — der Zustand, in dem der Assistent
 * startet. Über `characterSchema.parse`, damit alle übrigen Felder echte Defaults tragen.
 */
const fighterBefore = characterSchema.parse({
  name: 'Bram Eisenhand',
  classes: [
    { sourceKey: FIGHTER_KEY, name: 'Kämpfer', level: FROM_LEVEL, subclassKey: CHAMPION_KEY, subclassName: 'Champion' },
  ],
});

export function loadFighterDelta(): Promise<LevelUpDelta> {
  return computeLevelUpDelta(fighterBefore, 0, TO_LEVEL);
}

/** Der Talent-Eintrag aus der Bibliothek — Quelle der Prosa UND der Deklaration. */
export async function loadMagicInitiate(): Promise<FeatEntry> {
  const feats = await getFeats();
  const feat = feats.find((f) => f.sourceKey === MAGIC_INITIATE_KEY);
  if (!feat) {
    throw new Error(`[eval] ${MAGIC_INITIATE_KEY} nicht in der Talent-Bibliothek — Vault-Shim aktiv?`);
  }
  return feat;
}

/** Das Talent als KI-Eingang, genau wie `featuresFor('feat')` es baut. */
export function featAsGained(feat: FeatEntry): GainedFeature {
  return featToGainedFeature(
    {
      key: feat.sourceKey,
      name: feat.name || featDisplayName(feat),
      nameDe: featDisplayName(feat),
      desc: feat.desc ?? '',
      descDe: feat.descDe,
    },
    TO_LEVEL,
  );
}

/**
 * Der Merkmals-Eingang dieses Aufstiegs — erwartet LEER: Stufe 4 bringt dem Kämpfer nur die
 * Attributsverbesserung, und die führt der Flow selbst. Wird hier etwas zurückgegeben, ist die
 * Isolation des Falls verloren (dann misst die Strecke zwei Ketten statt einer).
 */
export async function loadBaseFeatures(): Promise<GainedFeature[]> {
  return gainedFeaturesFor(await loadFighterDelta());
}

/** Klassen-Kontext des Aufstiegs: Nicht-Zauberwirker, Subklasse längst gewählt. */
export const fighterClassContext: FeatureClassContext = {
  klasseName: 'Kämpfer',
  subclassName: 'Champion',
  casterType: 'NONE',
  casterKind: 'none',
  spellcastingAbility: '',
  toLevel: TO_LEVEL,
};
