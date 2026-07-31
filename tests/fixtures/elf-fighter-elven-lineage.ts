/**
 * Fixture: Elf-Kämpfer (Hintergrund „Soldat") auf Stufe 1 — der Fall „unredigierter Zweig
 * geht an Pass C".
 *
 * Warum dieser Fall: „Elfenabstammung" ist der einzige Vault-Eintrag, bei dem die WAHL
 * deklariert ist (`grantsChoice.kind = 'optionList'`, drei Zweige), die WIRKUNG der Stufe 1
 * aber nicht — `options[].spells` trägt die Zauber 1/3/5, ein `options[].grants` fehlt. Damit
 * bleibt genau eine Sache KI-Arbeit: die Prosa der gewählten Tabellenzeile („The range of
 * your Darkvision increases to 120 feet"), für die `featureGrant` kein Feld hat.
 *
 * Der Weg dorthin ist der WIZARD, nicht der Aufstieg: `declaredSources` im Aufstieg trägt
 * keine Speziesmerkmale („ein Aufstieg erlangt kein Volksmerkmal"), die Wahl fällt bei der
 * Erschaffung. Deshalb entsteht der Eingang über `buildFeaturePrep` — denselben Weg, den
 * `CharacterWizard.kickoff()` und `finalizeFeatures()` nehmen.
 *
 * Kämpfer und „Soldat" sind mit Bedacht gewählt: beide bringen KEINE zweite Zauber-Quelle
 * mit (Kampfstil und Waffenbeherrschung sind flow-eigen und fallen aus dem Eingang, das
 * Herkunftstalent „Wilder Angreifer" gewährt keine Zauber). Jeder Zauber, der in dieser
 * Strecke auftaucht, kann also nur aus der Abstammungs-Tabelle stammen.
 *
 * Vault-Reads laufen im Node-Eval über den fs-Shim (tests/support/tauriInvokeShim.ts).
 */
import type {
  FeatureEffectsContext,
  GainedFeature,
  ResolvedChoice,
} from '../../src/lib/services/aiActions/featureEffectsAction';
import type { DeclaredFeature } from '../../src/lib/services/declaredFeature';
import { unredactedChoiceFeatures } from '../../src/lib/services/featureDeclaration';
import { featureChoiceGrantSchema } from '../../src/lib/schemas/shared';
import { buildFeaturePrep, type FeaturePrep } from '../../src/lib/services/wizard/featurePrep';

/** Die Grundwahl aus Schritt 1 des Wizards (Bibliotheks-Keys wie in der Sidebar). */
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
 * Die Zauber des gewählten Zweigs kommen DETERMINISTISCH aus `options[].spells`
 * (`optionListRider`, geprüft in `evals/featureDeclaration.test.ts`) — hier sind sie deshalb
 * eine NEGATIVprobe. Getrennt nach Stufe, weil die beiden Hälften unterschiedlich weh tun:
 *
 *  - Stufe 1 („Tanzende Lichter") ist die DUBLETTE: derselbe Zaubertrick aus zwei Quellen.
 *  - Stufe 3/5 wäre ein Zauber, den der Charakter auf Stufe 1 noch NICHT hat — der Fehler,
 *    den nur die Staffelung über die Antwort verhindert.
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
 * Die Stufe-1-Mechanik des Drow-Zweigs, an der die Notiz erkennbar ist: die
 * Dunkelsicht-Reichweite — englisch „120 feet", deutsch „36 Meter" (der Übersetzungs-Call
 * rechnet auf die Einheit des Bogens um). Geprüft wird gegen beide, weil eine
 * fehlgeschlagene Übersetzung die englische Zeile stehen lässt.
 */
export const DARKVISION_RANGE = ['120', '36'] as const;

export const loadElfFighterPrep = (): Promise<FeaturePrep> => buildFeaturePrep(ELF_FIGHTER_BASICS);

/**
 * Eingang von Call 1 — genau wie `kickoff()`: Klassen- und Speziesmerkmale OHNE die mit
 * deklarierter Wahl. Die Elfenabstammung fehlt hier bewusst; die Analyse würde sonst
 * dieselbe Frage ein zweites Mal stellen.
 */
export function analysisContext(prep: FeaturePrep): FeatureEffectsContext {
  return {
    classContext: prep.classContext,
    features: [...prep.analysisGained, ...prep.analysisSpeciesFeatures],
    pastChoices: [],
  };
}

/**
 * Die unredigierten Zweig-Merkmale als Pass-C-Eingang — der Aufruf aus `finalizeFeatures()`.
 * `gainedAt: 1`, weil im Wizard alles Stufe 1 ist.
 */
export function unredactedFeatures(declared: DeclaredFeature[], branch = CHOSEN_BRANCH): GainedFeature[] {
  return unredactedChoiceFeatures(declared, (f) => (f.key === LINEAGE_KEY ? branch : '')).map((f) => ({
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
      grantsChoice: featureChoiceGrantSchema.parse({
        ...f.grantsChoice,
        options: f.grantsChoice.options.map((o) => (o.value === branch ? { ...o, grants: {} } : o)),
      }),
    };
  });
}
