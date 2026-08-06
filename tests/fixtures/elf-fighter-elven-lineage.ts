/**
 * Fixture: Elf-Kämpfer („Soldat"), Stufe 1 — der Fall „unredigierter Zweig geht an Pass C".
 *
 * „Elfenabstammung" ist der einzige Vault-Eintrag, bei dem die WAHL deklariert ist
 * (`grantsChoice.kind = 'optionList'`), die WIRKUNG der Stufe 1 aber nicht: `options[].spells`
 * trägt die Zauber 1/3/5, `options[].grants` fehlt. KI-Arbeit bleibt nur die Prosa der
 * gewählten Zeile („Darkvision increases to 120 feet"), für die `featureGrant` kein Feld hat.
 *
 * Der Weg ist der WIZARD, nicht der Aufstieg: dessen `declaredSources` trägt keine
 * Speziesmerkmale, die Wahl fällt bei der Erschaffung — daher `buildFeaturePrep`.
 *
 * Kämpfer und „Soldat" bringen KEINE zweite Zauber-Quelle mit (Kampfstil und
 * Waffenbeherrschung sind flow-eigen, „Wilder Angreifer" gewährt nichts). Jeder Zauber in
 * dieser Strecke kann also nur aus der Abstammungs-Tabelle stammen.
 */
import type { FeatureEffectsContext } from '../../src/lib/services/aiActions/featureEffectsAction';
import type { GainedFeature, ResolvedChoice } from '../../src/lib/services/analysis/types';
import type { DeclaredFeature } from '../../src/lib/services/declaredFeature';
import { unredactedChoiceFeatures } from '../../src/lib/services/declaration/optionList';
import { branchAnswerOf } from '../support/branchAnswer';
import { featureChoiceGrantSchema } from '../../src/lib/schemas/featureChoice';
import { buildFeaturePrep, type FeaturePrep } from '../../src/lib/services/wizard/featurePrep';

export const ELF_FIGHTER_BASICS = {
  species: { sourceKey: 'srd-2024_elf', name: 'Elf' },
  klass: { sourceKey: 'srd-2024_fighter', name: 'Kämpfer' },
  background: { sourceKey: 'srd-2024_soldier', name: 'Soldat' },
} as const;

/** Das Merkmal mit deklarierter Wahl und unredigierter Wirkung — der Anker aller Prüfungen. */
export const LINEAGE_KEY = 'srd-2024_elf_elven-lineage';
/** Englischer Merkmalsname, wie ihn `featureName` wortgleich zurückgeben muss. */
export const LINEAGE_NAME = 'Elven Lineage';
export const LINEAGE_NAME_DE = 'Elfenabstammung';

/** Der im Eval gewählte Zweig — Wert und Anzeige sind hier gleich (der Vault zitiert „Drow"). */
export const CHOSEN_BRANCH = 'Drow';

/** Die beiden NICHT gewählten Zweige, in beiden Sprachen (Zitate aus `desc`/`descDe`). */
export const OTHER_BRANCHES = ['High Elf', 'Wood Elf'] as const;
export const OTHER_BRANCHES_DE = ['Hochelf', 'Waldelf'] as const;

/**
 * NEGATIVprobe: die Zauber kommen deterministisch aus `options[].spells` (`optionListRider`).
 * Nach Stufe getrennt, weil die Hälften unterschiedlich weh tun — Stufe 1 wäre die DUBLETTE
 * aus zwei Quellen, Stufe 3/5 ein Zauber, den der Charakter noch gar nicht hat.
 */
export const DROW_SPELLS_L1 = ['Dancing Lights'] as const;
export const DROW_SPELLS_L1_DE = ['Tanzende Lichter'] as const;
export const DROW_SPELLS_LATER = ['Faerie Fire', 'Darkness'] as const;
export const DROW_SPELLS_LATER_DE = ['Feenfeuer', 'Dunkelheit'] as const;
/** Alle Zauber des Zweigs, beide Sprachen — für die Prüfung der Bogen-Notiz. */
export const DROW_SPELLS_ALL = [
  ...DROW_SPELLS_L1, ...DROW_SPELLS_L1_DE, ...DROW_SPELLS_LATER, ...DROW_SPELLS_LATER_DE,
] as const;

/** Die Zauber der beiden anderen Zweige — sie stehen in derselben Tabelle im Eingang. */
export const OTHER_BRANCH_SPELLS = [
  'Prestidigitation', 'Detect Magic', 'Misty Step',
  'Druidcraft', 'Longstrider', 'Pass without Trace',
] as const;
export const OTHER_BRANCH_SPELLS_DE = [
  'Taschenspielerei', 'Magie entdecken', 'Nebelschritt',
  'Druidenkunst', 'Lange Schritte', 'Spurloses Gehen',
] as const;

/**
 * Dunkelsicht-Reichweite, an der die Notiz erkennbar ist: „120 feet" bzw. „36 Meter".
 * Beide, weil eine fehlgeschlagene Übersetzung die englische Zeile stehen lässt.
 */
export const DARKVISION_RANGE = ['120', '36'] as const;

export const loadElfFighterPrep = (): Promise<FeaturePrep> => buildFeaturePrep(ELF_FIGHTER_BASICS);

/**
 * Eingang von Call 1 wie `kickoff()`: OHNE die Merkmale mit deklarierter Wahl. Die
 * Elfenabstammung fehlt bewusst — die Analyse stellte sonst dieselbe Frage ein zweites Mal.
 */
export function analysisContext(prep: FeaturePrep): FeatureEffectsContext {
  return {
    classContext: prep.classContext,
    features: [...prep.analysisGained, ...prep.analysisSpeciesFeatures],
    pastChoices: [],
  };
}

/** Der Aufruf aus `finalizeFeatures()`; `gainedAt: 1`, weil im Wizard alles Stufe 1 ist. */
export function unredactedFeatures(declared: DeclaredFeature[], branch = CHOSEN_BRANCH): GainedFeature[] {
  const answerOf = branchAnswerOf(declared, LINEAGE_KEY, branch);
  return unredactedChoiceFeatures(declared, answerOf).map((f) => ({
    ...f,
    desc: f.desc ?? '',
    gainedAt: 1,
  }));
}

/** Eingang von Pass C: derselbe Analyse-Eingang PLUS die unredigierten Zweig-Merkmale. */
export function finalizeContext(
  prep: FeaturePrep,
  resolvedChoices: ResolvedChoice[],
  declared: DeclaredFeature[] = prep.declared,
): FeatureEffectsContext {
  const base = analysisContext(prep);
  return { ...base, features: [...base.features, ...unredactedFeatures(declared)], resolvedChoices };
}

/**
 * Dieselbe Deklaration mit `grants: {}` am GEWÄHLTEN Zweig — „geprüft, gewährt nichts".
 * Der Diskriminator der Gegenprobe: fehlendes `grants` heißt „nie redigiert, also deutet
 * die KI", `{}` heißt „es gibt nichts zu deuten".
 *
 * Nur der gewählte Zweig wird redigiert: `unredactedChoiceFeatures` fragt die GETROFFENE
 * Option, nicht die Liste — eine Redaktion an einem anderen Zweig darf nichts ändern.
 */
export function withRedactedBranch(declared: DeclaredFeature[], branch = CHOSEN_BRANCH): DeclaredFeature[] {
  return declared.map((f) => {
    if (f.key !== LINEAGE_KEY || !f.grantsChoice) return f;
    return {
      ...f,
      // Neu geparst, damit `grants: {}` die vollen Defaults trägt — wie ein Vault-Eintrag,
      // der die Redaktion mitbringt.
      grantsChoice: f.grantsChoice.map((g) =>
        featureChoiceGrantSchema.parse({
          ...g,
          options: g.options.map((o) => (o.value === branch ? { ...o, grants: {} } : o)),
        }),
      ),
    };
  });
}
