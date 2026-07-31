/**
 * Eval-Case: was die Deklaration eines Zweig-Merkmals bringt — gemessen am selben Merkmal.
 *
 * „Unholdisches Erbe" (Tiefling, Stufe 1, Zweig „Infernal") auf beiden Wegen, mit EINEM Satz
 * Prüfungen: was am Ende am Charakter steht, muss identisch sein, egal wie es entstanden ist.
 * Verglichen werden dann die harten Zahlen des Reports — Latenz, Tokens und die Zahl der
 * mitgeschnittenen Calls (die steht im Report, nicht im Ergebnis: sie ist eine Beobachtung
 * über den Lauf, keine Zusicherung an ihn).
 *
 *   A „heute" (undeklariert): Analyse erkennt die Wahl und BLOCKIERT → Antwort → Nach-Analyse
 *       → Pass C. Die Zauber der Tabelle liest das Modell.
 *   B „deklariert": die Wahl kommt aus der Bibliothek (kein Call), die Zauber aus
 *       `options[].spells`, und nur die Prosa der gewählten Zeile geht an Pass C.
 *
 * Gemessen wird das Ergebnis des FLOWS, nicht das eines Calls: Fall B setzt die Rider so
 * zusammen wie `CharacterWizard.riders` (KI-Rider + deklarierte Rider). Sonst verglichen wir
 * zwei verschiedene Dinge — bei B ist der halbe Effekt ja gerade der, der ohne Modell entsteht.
 *
 * ERGEBNIS 2026-07-31 (je 5 Läufe, seriell): identisch, wo es zählt (Resistenz auf dem Bogen,
 * keine Zweig-Vermischung, genau eine Zweigwahl) — auseinander bei den Zaubern (A 1/5, B 5/5
 * „genau der Zaubertrick"; A 1/5, B 5/5 „kein Vorgriff auf 3/5") und bei den Kosten
 * (A 42,9 s / 17,3k Token, B 30,9 s / 13,9k). Zwei Dinge, die der Vergleich nebenbei zeigt:
 *   - Der KI-Weg fragte in 3/5 Läufen zusätzlich nach dem ZAUBERATTRIBUT des Erbes; die
 *     Deklaration kennt nur den Zweig, also fällt diese Frage weg (weiche Probe, 0/5).
 *   - Beide Wege erfinden eine Größen-Wahl, obwohl das Größen-Merkmal als reiner Bogenwert aus
 *     dem Eingang fällt und der Wizard sie deterministisch stellt (`prep.sizeChoice`). In B ist
 *     sie der einzige Grund, weshalb noch Wahl-Übersetzung und Nach-Analyse laufen — ohne sie
 *     wären es drei Calls statt fünf.
 */
import type { FeatureRider } from '../../src/lib/schemas/levelUp';
import {
  analyzeFeatureEffects,
  finalizeFeatureEffects,
  type FeatureAnalysis,
  type ResolvedChoice,
} from '../../src/lib/services/aiActions/featureEffectsAction';
import {
  optionChoiceId,
  optionListChoices,
  optionListRiders,
  withDeclaredGrants,
} from '../../src/lib/services/featureDeclaration';
import type { LlmConfig } from '../../src/lib/types';
import type { Checks, EvalCase } from '../defineEval';
import { isSheetReady, SHEET_NOTE_LIMIT } from './featureEffectsStep';
import {
  CHOSEN_LEGACY,
  declaredAnalysisContext,
  declaredFinalizeContext,
  declaredSources,
  LEGACY_CANTRIP,
  LEGACY_CANTRIP_DE,
  LEGACY_KEY,
  LEGACY_LATER,
  LEGACY_LATER_DE,
  loadTieflingPrep,
  OTHER_LEGACIES,
  OTHER_LEGACIES_DE,
  OTHER_LEGACY_SPELLS,
  OTHER_LEGACY_SPELLS_DE,
  RESISTANCE_DAMAGE,
  RESISTANCE_DE,
  undeclaredContext,
} from '../fixtures/tiefling-l1-fiendish-legacy';

/** Was am Ende am Charakter steht — auf beiden Wegen dieselbe Form. */
export interface LegacyResult {
  riders: FeatureRider[];
  /** Wahlen nach dem ZWEIG (Abyssal/Chthonic/Infernal) — auf beiden Wegen genau eine. */
  branchQuestions: number;
  /**
   * Ob der Spieler auch nach dem ZAUBERATTRIBUT gefragt wurde („Intelligence, Wisdom, or
   * Charisma is your spellcasting ability for the spells you cast with this trait"). Der
   * ehrliche Unterschied der beiden Wege: die Deklaration kennt nur den Zweig.
   */
  abilityQuestion: boolean;
}

const legacyRe = /fiendish legacy|unholdisches erbe/i;
const legacyRider = (r: LegacyResult): FeatureRider | undefined =>
  r.riders.find((x) => x.featureKey === LEGACY_KEY || legacyRe.test(x.featureName));

const spells = (r: LegacyResult) => new Set(r.riders.flatMap((x) => x.grantedSpells).map((s) => s.toLowerCase().trim()));
const allNotes = (r: LegacyResult) => r.riders.map((x) => x.sheetNote.trim()).filter(Boolean);
const hasAny = (hay: string, needles: readonly string[]) =>
  needles.some((n) => hay.toLowerCase().includes(n.toLowerCase()));

/**
 * Der eine Satz Prüfungen. Er misst NICHT die Prompt-Qualität, sondern ob beide Wege dasselbe
 * Ergebnis liefern — deshalb gaten sie beide Fälle.
 */
const core: Checks<LegacyResult> = {
  'liefert einen Rider für das Erbe': (r) => !!legacyRider(r),
  // Gemessen wird der Schnitt mit der ERBE-TABELLE, nicht die Gesamtzahl der Zauber: der
  // Tiefling bringt mit „Otherworldly Presence" einen zweiten, völlig legitimen Zaubertrick
  // (Thaumaturgie) mit — der gehört nicht in diese Rechnung.
  'gewährt aus der Erbe-Tabelle genau den Zaubertrick des Zweigs': (r) => {
    const got = spells(r);
    const fromTable = TABLE_SPELLS.filter((s) => got.has(s.toLowerCase()));
    return fromTable.length === 1 && new RegExp(`^(${LEGACY_CANTRIP}|${LEGACY_CANTRIP_DE})$`, 'i').test(fromTable[0]);
  },
  'greift nicht auf die Zeilen der Stufen 3 und 5 vor': (r) => {
    const got = spells(r);
    return ![...LEGACY_LATER, ...LEGACY_LATER_DE].some((s) => got.has(s.toLowerCase()));
  },
  'vermischt die Zweige nicht (nichts aus Abyssal/Chthonic)': (r) => {
    const got = spells(r);
    if ([...OTHER_LEGACY_SPELLS, ...OTHER_LEGACY_SPELLS_DE].some((s) => got.has(s.toLowerCase()))) return false;
    const note = legacyRider(r)?.sheetNote ?? '';
    return !hasAny(note, [...OTHER_LEGACIES, ...OTHER_LEGACIES_DE, ...OTHER_LEGACY_SPELLS, ...OTHER_LEGACY_SPELLS_DE]);
  },
  // Die Resistenz ist die ganze Prosa-Mechanik der Stufe 1 — kein Grant-Feld kennt sie, also
  // steht sie auf dem Bogen oder nirgends.
  'die Resistenz des Zweigs steht auf dem Bogen': (r) => {
    const note = legacyRider(r)?.sheetNote ?? '';
    return RESISTANCE_DE.test(note) && RESISTANCE_DAMAGE.test(note);
  },
  'stellt die Zweigwahl genau einmal': (r) => r.branchQuestions === 1,
  'erfindet weder Übung noch Attributsbonus': (r) =>
    r.riders.every(
      (x) =>
        Object.values(x.abilityScoreIncrease).every((v) => v === 0) &&
        x.proficiencies.skills.length === 0 &&
        x.proficiencies.savingThrows.length === 0,
    ),
};

const soft: Checks<LegacyResult> = {
  [`Bogen-Notizen sind einzeilig und ≤ ${SHEET_NOTE_LIMIT} Zeichen`]: (r) => {
    const notes = allNotes(r);
    return notes.length > 0 && notes.every(isSheetReady);
  },
  'die Notiz nennt den gewählten Zweig': (r) => hasAny(legacyRider(r)?.sheetNote ?? '', [CHOSEN_LEGACY, 'Infernalisch']),
  'verspricht keine Mechanik der Stufen 3 und 5': (r) =>
    !/ohne\s+(einen\s+)?zauberplatz|without a spell slot|kostenlos|frei\s+wirken|einmal\s+(pro|je)/i.test(
      legacyRider(r)?.sheetNote ?? '',
    ),
  'nennt den Zaubertrick nicht zusätzlich in der Notiz': (r) =>
    !hasAny(legacyRider(r)?.sheetNote ?? '', [LEGACY_CANTRIP, LEGACY_CANTRIP_DE]),
  /**
   * WEICH, weil die beiden Wege sich hier per Konstruktion unterscheiden — und genau deshalb
   * gemessen: `optionList` deklariert den Zweig, nicht das Zauberattribut. Was der KI-Weg
   * nebenbei mitfragte, fällt mit der Deklaration weg (der Zaubertrick braucht es für seinen
   * Angriffswurf). Die Zahl gehört in den Vergleich, nicht in ein Gatter.
   */
  'fragt auch das Zauberattribut des Erbes ab': (r) => r.abilityQuestion,
};

/** Alles, was in der Erbe-Tabelle steht — in beiden Sprachen. Der Maßstab der Zauber-Proben. */
const TABLE_SPELLS: readonly string[] = [
  LEGACY_CANTRIP, LEGACY_CANTRIP_DE,
  ...LEGACY_LATER, ...LEGACY_LATER_DE,
  ...OTHER_LEGACY_SPELLS, ...OTHER_LEGACY_SPELLS_DE,
];

/** Die drei Zweig-Labels — daran erkennt man die Zweigwahl, egal wie sie formuliert ist. */
const BRANCH_VALUES = [CHOSEN_LEGACY, ...OTHER_LEGACIES] as const;

/** Eine Wahl nach dem Zauberattribut (Int/Wei/Cha), nicht nach dem Zweig. */
const isAbilityChoice = (c: { options: string[]; question: string }) =>
  /intelligence|wisdom|charisma|intelligenz|weisheit/i.test([...c.options, c.question].join(' '));

/** Antwortet wie ein Spieler: das Erbe → „Infernal", sonst die erste Option. */
function answerChoices(analysis: FeatureAnalysis): ResolvedChoice[] {
  return analysis.choices
    .filter((c) => c.type !== 'spell-pick' && c.options.length > 0)
    .map((c) => {
      const infernal = c.options.find((o) => /infernal/i.test(o));
      return { id: c.id, choice: infernal ?? c.options[0] };
    });
}

export async function buildFiendishLegacyCases(): Promise<EvalCase<LegacyResult>[]> {
  const prep = await loadTieflingPrep();
  const declared = declaredSources(prep);
  const legacyDecl = declared.find((f) => f.key === LEGACY_KEY);
  if (!legacyDecl?.grantsChoice) {
    throw new Error(`[eval] ${LEGACY_KEY} deklariert keine Wahl — vault/species/tiefling.json aktuell?`);
  }
  const undeclaredCtx = undeclaredContext(prep);

  return [
    {
      label: 'A — heute: das Erbe geht komplett an die KI (Wahl blockiert, Nach-Analyse)',
      input: JSON.stringify(undeclaredCtx),
      run: async (cfg: LlmConfig): Promise<LegacyResult> => {
        const analysis = await analyzeFeatureEffects(cfg, undeclaredCtx, { noRetry: true });
        const resolvedChoices = answerChoices(analysis);
        const effects = await finalizeFeatureEffects(cfg, { ...undeclaredCtx, resolvedChoices }, analysis, {
          noRetry: true,
        });
        return {
          riders: effects.riders,
          branchQuestions: analysis.choices.filter((c) => hasAny(c.options.join(' '), BRANCH_VALUES)).length,
          abilityQuestion: analysis.choices.some(
            (c) => (c.featureKey === LEGACY_KEY || legacyRe.test(`${c.feature} ${c.question}`)) && isAbilityChoice(c),
          ),
        };
      },
      core,
      soft,
    },
    {
      label: 'B — deklariert: Wahl und Zauber aus der Bibliothek, nur die Prosa an Pass C',
      input: JSON.stringify(declaredFinalizeContext(prep, [])),
      run: async (cfg: LlmConfig): Promise<LegacyResult> => {
        const analysis = await analyzeFeatureEffects(cfg, declaredAnalysisContext(prep), { noRetry: true });
        const resolvedChoices = answerChoices(analysis);
        const ctx = declaredFinalizeContext(prep, resolvedChoices);
        const effects = await finalizeFeatureEffects(cfg, ctx, analysis, { noRetry: true });
        // Wie `CharacterWizard.riders`: KI-Rider (mit deklarierten Grants) plus die Rider der
        // Zweigwahlen. Stufe 1 → nur die erste Zeile der Options-Zauberliste greift.
        const answerOf = (id: string) => (id === optionChoiceId(legacyDecl) ? CHOSEN_LEGACY : '');
        return {
          riders: [...withDeclaredGrants(effects.riders, declared), ...optionListRiders(declared, answerOf, 1)],
          // Die Wahl stellt der Flow aus der Deklaration — ohne Call.
          branchQuestions: optionListChoices([legacyDecl]).length,
          // Die Deklaration trägt nur den Zweig; nach dem Attribut fragt niemand mehr.
          abilityQuestion: false,
        };
      },
      core,
      soft,
    },
  ];
}
