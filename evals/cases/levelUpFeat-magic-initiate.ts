/**
 * Eval-Case: der TALENT-Pfad des Stufenaufstiegs (Kämpfer 3→4, „Eingeweihter der Magie").
 *
 * Zwei Fälle, EIN Satz Assertions — die beiden Wege, auf denen der Zauber-Zugang eines
 * Talents entstehen kann:
 *   A „KI-Pfad" — das Talent geht komplett an die Deutung (`analyzeFeatureEffects` +
 *      `finalizeFeatureEffects`), wie es der Aufstieg bis 2026-07-30 tat.
 *   B „deklarierter Pfad" — Liste, Attribut und Kontingent kommen aus
 *      `grantsChoice.kind === "spellAccess"` (`services/spellAccess.ts`), ohne LLM.
 *
 * Beide liefern denselben Ergebnistyp (`AnalysisChoice[]`) — das ist der Grund, weshalb
 * dieselben Prüfungen auf beiden laufen können und der Vergleich nicht an unterschiedlichen
 * Maßstäben hängt. Gemessen wird also nicht „ist der Prompt gut", sondern: liefert dieser Weg
 * die vier Wahlen, die der Vault deklariert — mit dem richtigen Kontingent.
 *
 * Kosten: Fall A ist Analyse + Finalisierung (~4 Calls je Lauf), Fall B kostet nichts.
 */
import type { FeatureRider } from '../../src/lib/schemas/levelUp';
import {
  analyzeFeatureEffects,
  finalizeFeatureEffects,
  type AnalysisChoice,
  type FeatureAnalysis,
  type FeatureEffectsContext,
  type ResolvedChoice,
} from '../../src/lib/services/aiActions/featureEffectsAction';
import { spellAccessChoices, spellAccessGrantOf } from '../../src/lib/services/spellAccess';
import type { LlmConfig } from '../../src/lib/types';
import type { Checks, EvalCase } from '../defineEval';
import {
  CANTRIP_COUNT,
  CHOSEN_LIST,
  DECLARED_ABILITIES,
  DECLARED_LISTS,
  EXPECTED_CHOICE_COUNT,
  featAsGained,
  fighterClassContext,
  LEVEL1_COUNT,
  loadBaseFeatures,
  loadMagicInitiate,
  MAGIC_INITIATE_KEY,
} from '../../tests/fixtures/fighter-l4-magic-initiate';

/** Ergebnis EINES Talent-Pfads: die zu treffenden Wahlen plus die (nur im KI-Pfad) Rider. */
export interface FeatPathResult {
  choices: AnalysisChoice[];
  riders: FeatureRider[];
}

const lower = (xs: readonly string[]) => xs.map((s) => s.trim().toLowerCase());
const sameSet = (got: readonly string[], want: readonly string[]) => {
  const a = new Set(lower(got));
  return a.size === want.length && lower(want).every((w) => a.has(w));
};

const picks = (r: FeatPathResult) => r.choices.filter((c) => c.type === 'spell-pick');
const pickOf = (r: FeatPathResult, level: number) => picks(r).find((c) => c.spellLevels.includes(level));
const plainChoices = (r: FeatPathResult) => r.choices.filter((c) => c.type !== 'spell-pick');
/** Die Wahl, die eine Zauberliste anbietet (Kleriker/Druide/Magier). */
const listChoice = (r: FeatPathResult) => plainChoices(r).find((c) => sameSet(c.options, DECLARED_LISTS));
/** Die Wahl, die das Zauberattribut anbietet. */
const abilityChoice = (r: FeatPathResult) => plainChoices(r).find((c) => sameSet(c.options, DECLARED_ABILITIES));

/**
 * Die neun harten Prüfungen — dieselben auf beiden Pfaden. Sie GATEN nur Fall B: seit der
 * Umstellung (2026-07-30) nimmt der Aufstieg für ein Talent mit Deklaration Fall B, Fall A ist
 * dafür unerreichbar (die Deckung sichert `evals/levelUpFeatAccess.test.ts`). Ein 90%-Gatter auf
 * Fall A würde also eine Forderung an toten Code stellen; seine Zahlen bleiben als Referenz im
 * Report — gemessen 2026-07-30, zweimal 5 Läufe, siehe docs/plan/plan-zauberwirker-vereinfachung.md.
 */
const checks: Checks<FeatPathResult> = {
  // DIE Falle: „two cantrips" muss EINE Wahl mit max 2 sein. `max: 1` kostet den Charakter
  // still einen Zaubertrick, und zwei getrennte Wahlen à 1 verdoppeln die Frage.
  [`Zaubertricks: eine Wahl mit max ${CANTRIP_COUNT}`]: (r) => {
    const c = pickOf(r, 0);
    return !!c && c.max === CANTRIP_COUNT && c.spellLevels.length === 1;
  },
  [`Grad-1-Zauber: eine Wahl mit max ${LEVEL1_COUNT}`]: (r) => {
    const c = pickOf(r, 1);
    return !!c && c.max === LEVEL1_COUNT && c.spellLevels.length === 1;
  },
  'genau zwei Zauber-Wahlen (Grad 0 und Grad 1)': (r) => picks(r).length === 2,
  // Der Filter des Pickers. Ohne gültigen Klassen-Key bietet er die GANZE Bibliothek an —
  // der Spieler wählt dann Zauber, die das Talent nicht gewährt.
  'beide Zauber-Wahlen filtern auf dieselbe erlaubte Liste': (r) => {
    const cs = picks(r);
    if (cs.length !== 2) return false;
    const classes = new Set(cs.map((c) => c.spellClass.trim().toLowerCase()));
    return classes.size === 1 && lower(DECLARED_LISTS).includes([...classes][0]);
  },
  'Zauberliste wird als Wahl aus genau drei Listen gestellt': (r) => !!listChoice(r),
  'Zauberattribut wird als Wahl aus genau Int/Wei/Cha gestellt': (r) => !!abilityChoice(r),
  [`genau ${EXPECTED_CHOICE_COUNT} Wahlen — keine erfundene fünfte`]: (r) => r.choices.length === EXPECTED_CHOICE_COUNT,
  // Zaubernamen kommen aus `vault/spells`, NIE aus einer Options-Liste (und nie als
  // gewährter Zauber: der Spieler wählt sie, das Talent gewährt sie nicht von sich aus).
  'nennt keine Zaubernamen': (r) =>
    picks(r).every((c) => c.options.length === 0) && r.riders.every((x) => x.grantedSpells.length === 0),
  'jede Wahl hängt am Talent-Key': (r) =>
    r.choices.length > 0 && r.choices.every((c) => c.featureKey === MAGIC_INITIATE_KEY),
};

const soft: Checks<FeatPathResult> = {
  'deutsche Frage an jeder Wahl gesetzt': (r) =>
    r.choices.length > 0 && r.choices.every((c) => c.questionDe.trim().length > 0),
  // Liste und Attribut sind dauerhaft (sie gehören ins Merkmals-Ledger), die Zauber selbst
  // stehen danach im Zauber-Block — ein zweiter Eintrag dort wäre eine zweite Wahrheit.
  'Liste/Attribut als Aufbau-Entscheidung, Zauber nicht': (r) =>
    !!listChoice(r)?.isBuildDecision && !!abilityChoice(r)?.isBuildDecision && picks(r).every((c) => !c.isBuildDecision),
  'die drei Listen sind deutsch beschriftet': (r) => {
    const c = listChoice(r);
    return !!c && sameSet(c.optionsDe, ['Kleriker', 'Druide', 'Magier']);
  },
  // Ein Talent, das nur Zauber-Zugang gewährt, erhöht kein Attribut und übt keine Fertigkeit.
  'erfindet weder Attributsbonus noch Übung': (r) =>
    r.riders.every(
      (x) =>
        Object.values(x.abilityScoreIncrease).every((v) => v === 0) &&
        x.proficiencies.skills.length === 0 &&
        x.proficiencies.savingThrows.length === 0,
    ),
};

/**
 * Antwortet auf die erkannten Wahlen wie ein Spieler am Talent-Checkpoint: Zauberliste →
 * Magier, Attribut → Intelligenz, sonst die erste Option. Zauber-Wahlen bleiben offen
 * (die trifft der Spieler im Picker, sie gehen nicht an das Modell zurück).
 */
function answerChoices(analysis: FeatureAnalysis): ResolvedChoice[] {
  return analysis.choices
    .filter((c) => c.type !== 'spell-pick' && c.options.length > 0)
    .map((c) => {
      const hit = c.options.find((o) => /wizard|magier|intelligence|intelligenz/i.test(o));
      return { id: c.id, choice: hit ?? c.options[0] };
    });
}

export async function buildMagicInitiateCases(): Promise<EvalCase<FeatPathResult>[]> {
  const feat = await loadMagicInitiate();
  const baseFeatures = await loadBaseFeatures();
  if (baseFeatures.length) {
    throw new Error(
      `[eval] Kämpfer 3→4 sollte keinen Merkmals-Eingang haben, geladen: ${baseFeatures.map((f) => f.name).join(', ')}`,
    );
  }
  const grant = spellAccessGrantOf({ key: feat.sourceKey, name: feat.name, nameDe: feat.nameDe, grantsChoice: feat.grantsChoice });
  if (!grant) throw new Error(`[eval] ${MAGIC_INITIATE_KEY} deklariert keinen spellAccess — vault/feats/magic-initiate.json?`);

  const ctx: FeatureEffectsContext = {
    classContext: fighterClassContext,
    features: [featAsGained(feat)],
    pastChoices: [],
  };

  return [
    {
      label: 'A — KI-Pfad: das Talent geht komplett an die Deutung',
      input: JSON.stringify(ctx),
      run: async (cfg: LlmConfig): Promise<FeatPathResult> => {
        const analysis = await analyzeFeatureEffects(cfg, ctx, { noRetry: true });
        const resolvedChoices = answerChoices(analysis);
        const effects = await finalizeFeatureEffects(cfg, { ...ctx, resolvedChoices }, analysis, { noRetry: true });
        return { choices: analysis.choices, riders: effects.riders };
      },
      soft: { ...checks, ...soft },
    },
    {
      label: 'B — deklarierter Pfad: Zugang aus dem Vault, ohne LLM',
      input: JSON.stringify({ grant, answeredList: CHOSEN_LIST }),
      // Kein Call: derselbe Aufruf, den der Aufstieg am Schritt `feat-links` fährt.
      run: async (): Promise<FeatPathResult> => ({
        choices: spellAccessChoices(grant, CHOSEN_LIST),
        riders: [],
      }),
      core: checks,
      soft,
    },
  ];
}
