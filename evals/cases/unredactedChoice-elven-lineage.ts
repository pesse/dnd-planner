/**
 * Eval-Case: der Pfad „unredigierter Zweig geht an Pass C" (Elf-Kämpfer, Stufe 1,
 * Elfenabstammung → „Drow").
 *
 * Gemessen wird EINE Zusicherung, die nur ein echter Call zeigen kann: die Wahl steht
 * (`choice: "Drow"` reist als FINAL mit), und Pass C soll daraus genau das machen, was die
 * Deklaration nicht ausdrücken kann — die Prosa der gewählten Tabellenzeile („The range of
 * your Darkvision increases to 120 feet"). Alles Übrige an diesem Merkmal ist deterministisch
 * und darf deshalb NICHT vom Modell kommen: die Zauber 1/3/5 stehen in `options[].spells`,
 * die Wahl protokolliert der Fragebogen, die Bogen-Zeile schreibt `optionListNoteLines`.
 *
 * Zwei Fälle, EIN Report:
 *   A — der echte Pfad: `analyzeFeatureEffects` (ohne das Merkmal) → Antworten →
 *       `finalizeFeatureEffects` MIT dem unredigierten Zweig, wie `finalizeFeatures()` es tut.
 *   B — Gegenprobe ohne LLM: derselbe Zweig mit `grants: {}` fällt aus dem Eingang, also
 *       findet für ihn gar kein Call statt.
 *
 * Die LLM-freien Zusicherungen (Optionen als Zitat, Staffelung der Zauber über die Stufen,
 * `unredactedChoiceFeatures` selbst) liegen in `evals/featureDeclaration.test.ts` und werden
 * hier NICHT wiederholt. Fall B ist die einzige Berührung — dort über den echten
 * Wizard-Eingang statt über ein handgebautes Merkmal.
 *
 * Kosten: Fall A ist Analyse + Nach-Analyse + Guided + zwei Übersetzungs-Calls je Lauf,
 * Fall B kostet nichts.
 *
 * Was die Strecke am 2026-07-30 gefunden hat (je 5 Läufe, Qwen3.6-35B) — der Grund, weshalb
 * die beiden Zauber-Proben so scharf formuliert sind:
 *   Erstlauf: „wiederholt den Zaubertrick nicht" 0/5, „greift nicht vor" 1/5. Das Modell erdete
 *     die ganze Drow-Spalte, Feenfeuer und Dunkelheit inklusive — auf Stufe 1 zwei vorbereitete
 *     Zauber, die der Charakter erst auf 3 und 5 hat.
 *   Nur Prompt (Pass-C-Regel 2 + Analyse-Regel 3 nehmen `choice`-Merkmale aus): 2/5 und 4/5 —
 *     deutlich besser, aber die Quote hing sichtbar daran, ob die Nach-Analyse die Namen erdete.
 *   Prompt + deterministischer Filter (`declaredBranchSpells`, featureEffectsAction.ts): 5/5.
 * Die Lehre ist die des ganzen Deklarations-Umbaus: der Prompt hebt die Quote, halten kann sie
 * nur der Code — das Modell sieht die Deklaration gar nicht.
 *
 * Die BOGEN-NOTIZ ist der Rest, den kein Filter greift (Prosa lässt sich nicht streichen, nur
 * anders anfordern): „zählt die gewährten Zauber nicht auf" ging 0/5 → 0/5 (allgemeine Regel 10)
 * → 4/5, sobald der Transkriptions-Turn die Merkmale mit getroffener Wahl NAMENTLICH nennt.
 * Dieselbe Stelle trägt die Stufen-Grenze: „verspricht keine Mechanik der Stufen 3 und 5" 5/5,
 * und die Notiz ist damit die knappe, vollständige Zeile („Elfenabstammung (Drow):
 * Dunkelsicht 36 m."). Serielle Einzel-Latenz über die Reihe: 24,3 → 24,9 → 25,7 → 26,4 s je
 * Lauf (Pass C stabil ~11,5 s) — der Preis der drei Prompt-Zusätze.
 */
import type { FeatureRider } from '../../src/lib/schemas/levelUp';
import {
  analyzeFeatureEffects,
  finalizeFeatureEffects,
  type FeatureAnalysis,
  type ResolvedChoice,
} from '../../src/lib/services/aiActions/featureEffectsAction';
import type { LlmConfig } from '../../src/lib/types';
import type { Checks, EvalCase } from '../defineEval';
import { isSheetReady, SHEET_NOTE_LIMIT } from './featureEffectsStep';
import {
  analysisContext,
  CHOSEN_BRANCH,
  DARKVISION_RANGE,
  DROW_SPELLS_ALL,
  DROW_SPELLS_L1,
  DROW_SPELLS_L1_DE,
  DROW_SPELLS_LATER,
  DROW_SPELLS_LATER_DE,
  finalizeContext,
  LINEAGE_KEY,
  LINEAGE_NAME,
  LINEAGE_NAME_DE,
  loadElfFighterPrep,
  OTHER_BRANCHES,
  OTHER_BRANCHES_DE,
  OTHER_BRANCH_SPELLS,
  OTHER_BRANCH_SPELLS_DE,
  unredactedFeatures,
  withRedactedBranch,
} from '../fixtures/elf-fighter-elven-lineage';

/**
 * Ergebnis eines Pfads. `inputNames` gehört dazu, weil in dieser Strecke der EINGANG die
 * halbe Aussage ist: Fall B prüft, dass das Merkmal dort nicht mehr auftaucht.
 */
export interface UnredactedResult {
  /** Merkmalsnamen des Pass-C-Eingangs, in Eingangsreihenfolge. */
  inputNames: string[];
  /** Ob für den Zweig überhaupt ein Call lief. */
  called: boolean;
  riders: FeatureRider[];
}

const lineageRe = /elven lineage|elfenabstammung/i;

/** Der Rider des Zweig-Merkmals — über den Key, ersatzweise über den Namen. */
const lineageRider = (r: UnredactedResult): FeatureRider | undefined =>
  r.riders.find((x) => x.featureKey === LINEAGE_KEY || lineageRe.test(x.featureName));

const notes = (r: UnredactedResult): string[] => r.riders.map((x) => x.sheetNote.trim()).filter(Boolean);
const lower = (xs: readonly string[]) => new Set(xs.map((s) => s.toLowerCase().trim()));
const grantedSpells = (r: UnredactedResult) => lower(r.riders.flatMap((x) => x.grantedSpells));

/** Nennt irgendein Feld des Riders einen dieser Begriffe? (Notiz + gewährte Zauber). */
const mentionsAny = (rider: FeatureRider | undefined, needles: readonly string[]): boolean => {
  const hay = [rider?.sheetNote ?? '', ...(rider?.grantedSpells ?? [])].join('\n').toLowerCase();
  return needles.some((n) => n && hay.includes(n.toLowerCase()));
};

// ── Fall A: der echte Pfad ───────────────────────────────────────────────────────

const core: Checks<UnredactedResult> = {
  // Pass-C-Regel 1: ein Rider je Eintrag in <gained_features>, in derselben Reihenfolge.
  // Der Zweig steht als LETZTER im Eingang — genau die Position, die ein Modell überliest.
  'ein Rider je Eingangs-Merkmal, in der Reihenfolge des Eingangs': (r) =>
    r.riders.length === r.inputNames.length &&
    r.riders.every((x, i) => x.featureName.trim() === r.inputNames[i]),
  'liefert überhaupt einen Rider für die Elfenabstammung': (r) => !!lineageRider(r),
  // DIE Zusicherung der Strecke: die Prosa der gewählten Zeile landet als Notiz. Ohne sie
  // wäre der ganze Pfad überflüssig — die Wahl selbst schreibt `optionListNoteLines`.
  'die Notiz trägt die Stufe-1-Mechanik des Zweigs (Dunkelsicht-Reichweite)': (r) => {
    const note = lineageRider(r)?.sheetNote ?? '';
    return DARKVISION_RANGE.some((n) => note.includes(n)) && /dunkelsicht|darkvision/i.test(note);
  },
  // Der Zaubertrick der Stufe 1 kommt aus `options[].spells` (deterministisch,
  // `optionListRider`) — ein `grantedSpells` daneben ist dieselbe Zusage aus zwei Quellen.
  'wiederholt den deterministisch gewährten Zaubertrick nicht': (r) => {
    const got = grantedSpells(r);
    return ![...DROW_SPELLS_L1, ...DROW_SPELLS_L1_DE].some((s) => got.has(s.toLowerCase()));
  },
  // Die schärfere Hälfte derselben Zusicherung: die Zeilen 3 und 5 stehen mit im Eingang,
  // gehören dem Charakter auf Stufe 1 aber noch nicht („Wenn du die Charakterstufen 3 und 5
  // erreichst"). Nur die Staffelung über die gespeicherte Antwort hält sie zurück.
  'greift nicht auf die Zeilen der Stufen 3 und 5 vor': (r) => {
    const got = grantedSpells(r);
    return ![...DROW_SPELLS_LATER, ...DROW_SPELLS_LATER_DE].some((s) => got.has(s.toLowerCase()));
  },
  // Pass-C-Regel 3: ein BENANNTER Zaubertrick ist kein freier Platz. `extraCantrips: 1`
  // würde dem Elf neben „Tanzende Lichter" noch einen Zaubertrick zur Wahl schenken.
  'schenkt keinen freien Zaubertrick': (r) => r.riders.every((x) => x.extraCantrips === 0),
  // Die Tabelle im Eingang trägt ALLE drei Zeilen. Der Zweig ist entschieden — was aus
  // Hochelf/Waldelf auftaucht, gehört einem anderen Charakter.
  'vermischt die Zweige nicht (nichts aus Hochelf/Waldelf)': (r) => {
    const got = grantedSpells(r);
    const foreign = [...OTHER_BRANCH_SPELLS, ...OTHER_BRANCH_SPELLS_DE];
    if (foreign.some((s) => got.has(s.toLowerCase()))) return false;
    return !mentionsAny(lineageRider(r), [...foreign, ...OTHER_BRANCHES, ...OTHER_BRANCHES_DE]);
  },
  // `choice` ist FINAL (der Absatz dazu steht im Analyse-Prompt). Eine Notiz, die die drei
  // Zweige noch anbietet oder zur Wahl auffordert, hat sie als offen gelesen.
  'stellt die getroffene Wahl nicht erneut': (r) => {
    const note = lineageRider(r)?.sheetNote ?? '';
    return !/\?/.test(note) && !/\b(choose|pick|wähle|entscheide)\b/i.test(note);
  },
  // Die Zweigwahl protokolliert `featureChoiceChanges` aus dem Fragebogen — sie steht gar
  // nicht in <resolved_choices>. Ein Eintrag hier wäre die zweite Ausfertigung.
  'protokolliert die Zweigwahl nicht (die trägt der Fragebogen)': (r) => {
    const branches = [CHOSEN_BRANCH, ...OTHER_BRANCHES, ...OTHER_BRANCHES_DE];
    return r.riders.every((x) =>
      x.decisions.every((d) => !branches.some((b) => [d.id, d.question, d.answer].join(' ').includes(b))),
    );
  },
  // Pass-C-Regel 7: protokolliert wird AUSSCHLIESSLICH, was in <resolved_choices> steht.
  // Alles andere erreicht den Bogen mit leerer Antwort (`fillDecisions` findet keine).
  'protokolliert keine unbeantwortete Wahl': (r) =>
    r.riders.every((x) => x.decisions.every((d) => d.answer.trim().length > 0)),
};

const soft: Checks<UnredactedResult> = {
  [`Bogen-Notizen sind einzeilig und ≤ ${SHEET_NOTE_LIMIT} Zeichen`]: (r) => {
    const all = notes(r);
    return all.length > 0 && all.every(isSheetReady);
  },
  'die Notiz nennt den gewählten Zweig': (r) => (lineageRider(r)?.sheetNote ?? '').includes(CHOSEN_BRANCH),
  // Die Notiz entsteht englisch und wird übersetzt; der Merkmalsname kommt aus dem Glossar.
  'die Notiz der Abstammung ist deutsch': (r) => {
    const note = lineageRider(r)?.sheetNote ?? '';
    return note.includes(LINEAGE_NAME_DE) && !note.includes(LINEAGE_NAME);
  },
  // Der Zauber steht schon im Zauber-Block des Bogens (deterministisch gewährt) — die knappe
  // Zeile soll die Mechanik nennen, nicht die Liste wiederholen (Pass-C-Regel 10).
  'zählt die gewährten Zauber nicht in der Notiz auf': (r) =>
    !mentionsAny(lineageRider(r), DROW_SPELLS_ALL),
  /**
   * Die Zeile darf nichts versprechen, was erst später gilt. Genau hier ist der Trait eine
   * Falle: das freie Wirken ohne Zauberplatz gehört den Zaubern der Stufen 3 und 5 („When you
   * reach character levels 3 and 5 … You can cast it once without a spell slot"), nicht dem
   * Stufe-1-Vorteil. Auf Stufe 1 ist die knappe Zeile die vollständige.
   */
  'verspricht keine Mechanik der Stufen 3 und 5': (r) =>
    !/ohne\s+(einen\s+)?zauberplatz|without a spell slot|kostenlos|frei\s+wirken|einmal\s+(pro|je)|1\s*[x×]\s*(pro|je)/i.test(
      lineageRider(r)?.sheetNote ?? '',
    ),
  // Eine erhöhte Dunkelsicht-Reichweite ist keine Übung und kein Attributsbonus. Weich,
  // weil es die klassische Fehldeutung ist und nicht die Aussage dieser Strecke.
  'deutet die Reichweite nicht als Übung oder Attributsbonus': (r) => {
    const rider = lineageRider(r);
    if (!rider) return false;
    const p = rider.proficiencies;
    return (
      Object.values(rider.abilityScoreIncrease).every((v) => v === 0) &&
      [p.skills, p.savingThrows, p.weapons, p.armor].every((xs) => xs.length === 0)
    );
  },
};

// ── Fall B: Gegenprobe (kein Call) ───────────────────────────────────────────────

const redactedCore: Checks<UnredactedResult> = {
  'der redigierte Zweig fällt aus dem Pass-C-Eingang': (r) => !r.inputNames.some((n) => lineageRe.test(n)),
  'ohne etwas zu deuten findet kein Call statt': (r) => !r.called && r.riders.length === 0,
};

/**
 * Antwortet auf die erkannten Wahlen wie ein Spieler im Merkmals-Schritt: jeweils die erste
 * Option. Zauber-Wahlen bleiben offen (die fallen im Wizard erst im Zauber-Schritt).
 *
 * Die Zweigwahl ist hier NICHT dabei: sie steht nicht in der Analyse (das Merkmal war aus
 * ihrem Eingang gefiltert), sondern reist als `choice` am Merkmal mit.
 */
function answerChoices(analysis: FeatureAnalysis): ResolvedChoice[] {
  return analysis.choices
    .filter((c) => c.type !== 'spell-pick' && c.options.length > 0)
    .map((c) => ({ id: c.id, choice: c.options[0] }));
}

export async function buildElvenLineageCases(): Promise<EvalCase<UnredactedResult>[]> {
  const prep = await loadElfFighterPrep();
  const unredacted = unredactedFeatures(prep.declared);
  if (unredacted.length !== 1 || unredacted[0].key !== LINEAGE_KEY) {
    throw new Error(
      `[eval] Erwartet genau die Elfenabstammung als unredigierten Zweig, bekommen: ` +
        `${unredacted.map((f) => f.key || f.name).join(', ') || '—'} — Vault-Shim aktiv? ` +
        '(vault/species/elf.json, vault/classes/fighter.json, vault/backgrounds/soldier.json)',
    );
  }
  if (unredacted[0].choice !== CHOSEN_BRANCH) {
    throw new Error(`[eval] Die Antwort reist nicht als choice mit: ${JSON.stringify(unredacted[0].choice)}`);
  }

  const analysisCtx = analysisContext(prep);
  const redactedDeclared = withRedactedBranch(prep.declared);

  return [
    {
      label: 'A — Pass C deutet die Prosa des gewählten Zweigs („Drow")',
      input: JSON.stringify(finalizeContext(prep, [])),
      // Kette wie im Wizard: kickoff() analysiert OHNE das Merkmal, der Merkmals-Schritt
      // sammelt die Antworten ein, finalizeFeatures() hängt den unredigierten Zweig an.
      run: async (cfg: LlmConfig): Promise<UnredactedResult> => {
        const analysis = await analyzeFeatureEffects(cfg, analysisCtx, { noRetry: true });
        const ctx = finalizeContext(prep, answerChoices(analysis));
        const effects = await finalizeFeatureEffects(cfg, ctx, analysis, { noRetry: true });
        return { inputNames: ctx.features.map((f) => f.name), called: true, riders: effects.riders };
      },
      core,
      soft,
    },
    {
      label: 'B — Gegenprobe: derselbe Zweig mit `grants: {}` — kein Call',
      input: JSON.stringify(finalizeContext(prep, [], redactedDeclared)),
      // Kein Call: der Eingang von Pass C entsteht wie in `finalizeFeatures()`, nur aus der
      // redigierten Deklaration — die Elfenabstammung ist dann nicht mehr darin.
      run: async (): Promise<UnredactedResult> => {
        const ctx = finalizeContext(prep, [], redactedDeclared);
        return {
          inputNames: ctx.features.map((f) => f.name),
          called: unredactedFeatures(redactedDeclared).length > 0,
          riders: [],
        };
      },
      core: redactedCore,
    },
  ];
}
