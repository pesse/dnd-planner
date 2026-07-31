/**
 * Fixture: Tiefling-Kämpfer (Hintergrund „Soldat") auf Stufe 1 — „Unholdisches Erbe".
 *
 * Der Zwilling der Elfenabstammung: dieselbe Tabellenform (Zweig × Stufe 1/3/5), dieselbe
 * unredigierte Wirkung (die Resistenz kennt `featureGrant` nicht) — nur war das Merkmal bis
 * 2026-07-30 NICHT deklariert und lief damit komplett über die KI. Genau das macht es zum
 * Messfall für den Nutzen der Deklaration: derselbe Charakter, dasselbe Merkmal, zwei Wege.
 *
 *   A „heute" — undeklariert: die Analyse erkennt die Wahl, BLOCKIERT (die Zauber hängen an
 *       ihr), der Spieler antwortet, eine Nach-Analyse läuft, Pass C deutet alles.
 *   B „deklariert" — wie es jetzt im Vault steht: die Wahl stellt der Flow aus der Bibliothek,
 *       die Zauber liest `optionListRider` je Stufe, und nur die Prosa geht an Pass C.
 *
 * Fall A entsteht dadurch, dass die Fixture die Deklaration WIEDER ENTFERNT — der „Vorher"-Stand
 * ist damit der künstliche, nicht der gemessene Zielzustand. Umgekehrt wäre B eine Handabschrift.
 */
import type {
  FeatureEffectsContext,
  GainedFeature,
  ResolvedChoice,
} from '../../src/lib/services/aiActions/featureEffectsAction';
import type { DeclaredFeature } from '../../src/lib/services/declaredFeature';
import { unredactedChoiceFeatures } from '../../src/lib/services/featureDeclaration';
import { buildFeaturePrep, type FeaturePrep } from '../../src/lib/services/wizard/featurePrep';

export const TIEFLING_FIGHTER_BASICS = {
  species: { sourceKey: 'srd-2024_tiefling', name: 'Tiefling' },
  klass: { sourceKey: 'srd-2024_fighter', name: 'Kämpfer' },
  background: { sourceKey: 'srd-2024_soldier', name: 'Soldat' },
} as const;

export const LEGACY_KEY = 'srd-2024_tiefling_fiendish-legacy';
export const LEGACY_NAME = 'Fiendish Legacy';

/** Der gemessene Zweig. „Infernal" ist der mit der geläufigsten Resistenz — Feuer. */
export const CHOSEN_LEGACY = 'Infernal';
export const CHOSEN_LEGACY_DE = 'Infernalisch';

/** Der Stufe-1-Zaubertrick des gewählten Zweigs — mehr gewährt Stufe 1 an Zaubern nicht. */
export const LEGACY_CANTRIP = 'Fire Bolt';
export const LEGACY_CANTRIP_DE = 'Feuerpfeil';

/** Die Zeilen 3 und 5 desselben Zweigs — auf Stufe 1 ein Vorgriff. */
export const LEGACY_LATER = ['Hellish Rebuke', 'Darkness'] as const;
export const LEGACY_LATER_DE = ['Höllischer Tadel', 'Dunkelheit'] as const;

/** Die beiden NICHT gewählten Zweige samt ihrer kompletten Spalten. */
export const OTHER_LEGACIES = ['Abyssal', 'Chthonic'] as const;
export const OTHER_LEGACIES_DE = ['Abyssisch', 'Chthonisch'] as const;
export const OTHER_LEGACY_SPELLS = [
  'Poison Spray', 'Ray of Sickness', 'Hold Person',
  'Chill Touch', 'False Life', 'Ray of Enfeeblement',
] as const;
export const OTHER_LEGACY_SPELLS_DE = [
  'Gift versprühen', 'Strahl der Übelkeit', 'Person festhalten',
  'Kalte Hand', 'Falsches Leben', 'Schwächestrahl',
] as const;

/** Die Prosa-Mechanik der Stufe 1, die kein Grant-Feld ausdrücken kann. */
export const RESISTANCE_DE = /resisten/i;
export const RESISTANCE_DAMAGE = /feuer|fire/i;

export const loadTieflingPrep = (): Promise<FeaturePrep> => buildFeaturePrep(TIEFLING_FIGHTER_BASICS);

const legacyOf = (prep: FeaturePrep): GainedFeature => {
  const f = prep.speciesFeatures.find((x) => x.key === LEGACY_KEY);
  if (!f) throw new Error(`[eval] ${LEGACY_KEY} nicht im Vault — Shim aktiv? (vault/species/tiefling.json)`);
  return f;
};

/** Das Merkmal OHNE seine Deklaration — der Stand vor dem 2026-07-30. */
export function undeclaredLegacy(prep: FeaturePrep): GainedFeature {
  const { grantsChoice: _drop, ...rest } = legacyOf(prep);
  return rest;
}

/**
 * Fall A: das undeklarierte Merkmal steht im Analyse-Eingang — dort erzwingt es die Wahl,
 * blockiert die Zauber und braucht deshalb die Nach-Analyse.
 */
export function undeclaredContext(prep: FeaturePrep): FeatureEffectsContext {
  return {
    classContext: prep.classContext,
    features: [...prep.analysisGained, ...prep.analysisSpeciesFeatures, undeclaredLegacy(prep)],
    pastChoices: [],
  };
}

/** Fall B, Call 1: der Eingang ohne das deklarierte Merkmal — die Wahl führt der Flow. */
export function declaredAnalysisContext(prep: FeaturePrep): FeatureEffectsContext {
  return {
    classContext: prep.classContext,
    features: [...prep.analysisGained, ...prep.analysisSpeciesFeatures],
    pastChoices: [],
  };
}

/** Fall B, Pass C: derselbe Eingang plus der unredigierte Zweig mit der getroffenen Antwort. */
export function declaredFinalizeContext(prep: FeaturePrep, resolvedChoices: ResolvedChoice[]): FeatureEffectsContext {
  const base = declaredAnalysisContext(prep);
  const unredacted = unredactedChoiceFeatures(prep.declared, (f) => (f.key === LEGACY_KEY ? CHOSEN_LEGACY : ''))
    .map((f) => ({ ...f, desc: f.desc ?? '', gainedAt: 1 }));
  return { ...base, features: [...base.features, ...unredacted], resolvedChoices };
}

/** Die Deklarations-Quellen des Wizards (für `optionListRiders`/`withDeclaredGrants`). */
export const declaredSources = (prep: FeaturePrep): DeclaredFeature[] => prep.declared;
