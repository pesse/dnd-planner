/**
 * Eval-Case: Merkmalsanalyse des Charakter-Erstell-Wizards für einen Gnom-Zauberer
 * (Hintergrund „Weiser") auf Stufe 1.
 *
 * Zwei Schritte, wie der Wizard sie fährt:
 *   Call 1 (`analyzeFeatureEffects`, aus `kickoff()`) — die Abstammungs-Wahl erkennen,
 *          BLOCKIEREN und noch keinen Zauber erden; zu den fünf wahllosen Merkmalen und zum
 *          flow-eigenen Herkunftstalent nichts erfinden.
 *   Call C (`finalizeFeatureEffects`, aus `finalizeFeatures()`) — nach der Wahl „Waldgnom":
 *          ein Rider je Merkmal, die Waldgnom-Zauber gewährt, die Felsgnom-Zauber nicht,
 *          die Wahl protokolliert.
 *
 * Die Antwort auf die Wahl wird NICHT vorformuliert: die Choice-ids erzeugt das Modell, also
 * liest Call C sie aus der Analyse desselben Laufs — genau wie die Oberfläche in
 * `commitFeatureChoices()`.
 *
 * Kosten: Call 1 ist ein LLM-Call, Call C drei (Analyse + Nach-Analyse + Guided) — bei
 * `--runs 3` also 12 Calls für die Strecke.
 */
import type { FeatureEffects, FeatureRider } from '../../src/lib/schemas/levelUp';
import {
  analyzeFeatureEffects,
  finalizeFeatureEffects,
  type AnalysisChoice,
  type FeatureAnalysis,
  type FeatureEffectsContext,
  type ResolvedChoice,
} from '../../src/lib/services/aiActions/featureEffectsAction';
import type { LlmConfig } from '../../src/lib/types';
import type { Checks, EvalCase } from '../defineEval';
import { asAnalysis, asEffects, isSheetReady, sheetNotes, SHEET_NOTE_LIMIT, type StepResult } from './featureEffectsStep';
import {
  ALL_FEATURE_KEYS,
  CHOSEN_LINEAGE,
  CHOSEN_LINEAGE_DE,
  EXPECTED_RIDER_NAMES,
  FOREST_GNOME_SPELLS,
  FOREST_GNOME_SPELLS_DE,
  LINEAGE_KEY,
  LINEAGE_OPTIONS,
  LINEAGE_OPTIONS_DE,
  loadGnomeSorcererContext,
  MAGIC_INITIATE_KEY,
  NO_CHOICE_KEYS,
  ROCK_GNOME_SPELLS,
  ROCK_GNOME_SPELLS_DE,
  SORCERER_SPELLCASTING_KEY,
} from '../fixtures/gnome-sorcerer-sage';

// ── Zuordnung Wahl → Merkmal ────────────────────────────────────────────────────
//
// Bewusst TOLERANT (Key ODER Name): dass `featureKey` wortgleich übernommen wird, ist eine
// eigene Assertion. Würden alle anderen Prüfungen strikt am Key hängen, fielen sie bei einem
// verpatzten Key mit — und man sähe nicht mehr, WAS die Analyse eigentlich verstanden hat.
const lineageRe = /abstammung|lineage|waldgnom|felsgnom/i;
const magicInitiateRe = /magiekundig|magic initiate/i;
/** Merkmalsnamen der fünf wahllosen Merkmale (Negativprobe). */
const noChoiceRe = /angeborene zauberei|innate sorcery|dunkelsicht|darkvision|gerissenheit|cunning|größe|groesse|\bsize\b|bewegungsrate|\bspeed\b/i;
const innateSorceryRe = /innate sorcery|angeborene zauberei/i;
const darkvisionRe = /darkvision|dunkelsicht/i;
const sizeRe = /\bsize\b|größe|groesse/i;
const speedRe = /\bspeed\b|bewegungsrate/i;
/**
  * Das flow-eigene Klassen-Zauberwirken — steht gar nicht im Eingang.
  *
  * Bewusst OHNE das bloße Wort „spellcasting": das Merkmal „Gnomische Abstammung" stellt
  * legitim die Frage nach dem Zauberattribut („your spellcasting ability for Gnomish Lineage
  * spells"), und die WILL eine weiche Probe weiter unten. Solange der Anker das Merkmal ist
  * (Key bzw. Klassenname), messen beide Proben dasselbe, ohne sich zu widersprechen.
  */
const classSpellcastingRe = /\bzauberwirken\b|zauberer-zaubertrick|sorcerer cantrip|from the sorcerer (spell )?list/i;

const label = (c: AnalysisChoice) => `${c.feature} ${c.question}`;
const isLineage = (c: AnalysisChoice) => c.featureKey === LINEAGE_KEY || lineageRe.test(label(c));
const isMagicInitiate = (c: AnalysisChoice) => c.featureKey === MAGIC_INITIATE_KEY || magicInitiateRe.test(label(c));

/** Die Abstammungs-Wahl selbst: die Wahl MIT Optionen (nicht die Zauberattribut-Frage). */
function lineageChoice(a: FeatureAnalysis): AnalysisChoice | undefined {
  return a.choices.find((c) => isLineage(c) && c.type !== 'spell-pick' && c.options.length >= 2);
}

const spellPicks = (a: FeatureAnalysis) => a.choices.filter((c) => c.type === 'spell-pick');
const norm = (xs: readonly string[]) => new Set(xs.map((s) => s.toLowerCase().trim()));

/** Alle Zaubernamen der Rider, kleingeschrieben. */
const grantedSpells = (fe: FeatureEffects) => norm(fe.riders.flatMap((r) => r.grantedSpells));

const riderFor = (fe: FeatureEffects, re: RegExp): FeatureRider | undefined =>
  fe.riders.find((r) => re.test(r.featureName));

// ── Call 1: Analyse ─────────────────────────────────────────────────────────────

const analyzeCore: Checks<StepResult> = {
  'erkennt die Gnomische Abstammung als erzwungene Wahl': (r) => {
    const a = asAnalysis(r);
    return !!a && !!lineageChoice(a);
  },
  'Optionen sind genau „Forest Gnome"/„Rock Gnome" (Wortlaut aus desc)': (r) => {
    const a = asAnalysis(r);
    const c = a && lineageChoice(a);
    if (!c) return false;
    const got = norm(c.options);
    return got.size === LINEAGE_OPTIONS.length && LINEAGE_OPTIONS.every((o) => got.has(o.toLowerCase()));
  },
  // Der Übersetzungs-Call ZITIERT aus `descDe` (`**Waldgnom.**`), er übersetzt nicht selbst:
  // die gespeicherte Anzeige wird gegen diesen Text gelesen, „Waldgnom (Forest Gnome)" oder
  // „Waldschrat" sind daher Fehlschläge.
  'Übersetzung zitiert „Waldgnom"/„Felsgnom" wörtlich aus descDe': (r) => {
    const a = asAnalysis(r);
    const c = a && lineageChoice(a);
    if (!c) return false;
    const got = norm(c.optionsDe);
    return got.size === LINEAGE_OPTIONS_DE.length && LINEAGE_OPTIONS_DE.every((o) => got.has(o.toLowerCase()));
  },
  // Deterministisch aus der Bibliothek (featureKey → nameDe) — nie vom Modell.
  'Merkmalsname der Wahl ist der deutsche Bibliotheksname': (r) => {
    const a = asAnalysis(r);
    const c = a && lineageChoice(a);
    return c?.featureDe === 'Gnomische Abstammung';
  },
  'deutsche Frage ist gesetzt und nicht die englische': (r) => {
    const a = asAnalysis(r);
    const c = a && lineageChoice(a);
    return !!c && c.questionDe.trim().length > 0 && c.questionDe !== c.question;
  },
  'Abstammung ist Aufbau-Wahl und schaltet weitere Effekte frei': (r) => {
    const a = asAnalysis(r);
    const c = a && lineageChoice(a);
    return !!c && c.isBuildDecision && c.determinesFurtherEffects && c.max === 1;
  },
  'blockiert, solange die Abstammung offen ist': (r) => asAnalysis(r)?.blocked === true,
  // Welche Zauber die Abstammung gewährt, steht erst nach der Wahl fest — vorher ist jeder
  // geerdete Zauber eine Vorwegnahme (Wald- ODER Felsgnom).
  'erdet noch keinen Zauber': (r) => asAnalysis(r)?.spellsToGround.length === 0,
  // Der Magiekundige deklariert seinen Zauber-Zugang und steht deshalb NICHT im Eingang
  // (`analysisGained`): Liste, Attribut und Anzahl fragt der Wizard deterministisch ab
  // (`services/spellAccess.ts`, geprüft in `evals/spellAccess.test.ts`). Jede Wahl dazu ist
  // hier also erfunden — genau wie beim Klassen-Zauberwirken.
  'erfindet keine Wahl zum flow-eigenen Magiekundigen': (r) => {
    const a = asAnalysis(r);
    if (!a) return false;
    return !a.choices.some((c) => c.featureKey === MAGIC_INITIATE_KEY || magicInitiateRe.test(label(c)));
  },
  // Zauber wählt ausschließlich der Zauber-Schritt aus `vault/spells`. Nach dem Wegfall des
  // Talents hat kein Merkmal des Eingangs noch eine Zauber-Wahl — eine wäre frei erfunden.
  'erfindet gar keine Zauber-Wahl mehr': (r) => {
    const a = asAnalysis(r);
    return !!a && spellPicks(a).length === 0;
  },
  'fragt keine Zauberliste ab': (r) => {
    const a = asAnalysis(r);
    if (!a) return false;
    return !a.choices.some(
      (c) => c.type !== 'spell-pick' && c.options.some((o) => /kleriker|druide|magier|cleric|druid|wizard/i.test(o)),
    );
  },
  // casterType FULL im Kontext, aber das Zauberwirken-Merkmal ist flow-eigen und NICHT im
  // Eingang: die vier Klassen-Zaubertricks wählt der Zauber-Schritt, nicht die Analyse.
  'erfindet keine Wahl aus dem Klassen-Zauberwirken': (r) => {
    const a = asAnalysis(r);
    if (!a) return false;
    return !a.choices.some(
      (c) => c.spellClass === 'sorcerer' || c.featureKey === SORCERER_SPELLCASTING_KEY || classSpellcastingRe.test(label(c)),
    );
  },
  'erfindet keine Wahl zu den fünf wahllosen Merkmalen': (r) => {
    const a = asAnalysis(r);
    if (!a) return false;
    return !a.choices.some(
      (c) => (NO_CHOICE_KEYS as readonly string[]).includes(c.featureKey) || (!isLineage(c) && !isMagicInitiate(c) && noChoiceRe.test(label(c))),
    );
  },
  'featureKey ist wortgleich aus <gained_features>': (r) => {
    const a = asAnalysis(r);
    if (!a) return false;
    return a.choices.length > 0 && a.choices.every((c) => ALL_FEATURE_KEYS.includes(c.featureKey));
  },
};

const analyzeSoft: Checks<StepResult> = {
  // „choose the ability when you select the lineage" — eine echte, dauerhafte Wahl der
  // ABSTAMMUNG (nicht des Talents, dessen Attribut jetzt deklariert ist). Weich, weil der
  // Bogen sie noch nicht führt und sie leicht in der Prosa untergeht.
  'fragt auch das Zauberattribut der Abstammung ab (Int/Wei/Cha)': (r) => {
    const a = asAnalysis(r);
    if (!a) return false;
    return a.choices.some(
      (c) => c.type !== 'spell-pick' && /intelligence|wisdom|charisma|intelligenz|weisheit/i.test([...c.options, c.question].join(' ')),
    );
  },
  // Geschlüsselt am ENGLISCHEN Optionswert (der stabilen Kennung), Inhalt deutsch.
  'optionHelp nennt beide Abstammungen mit ihrer Konsequenz': (r) => {
    const a = asAnalysis(r);
    const c = a && lineageChoice(a);
    if (!c) return false;
    return LINEAGE_OPTIONS.every((o) => (c.optionHelpDe[o] ?? '').trim().length > 0);
  },
  'optionHelp trennt die Zweige mechanisch (Zauber je Abstammung)': (r) => {
    const a = asAnalysis(r);
    const c = a && lineageChoice(a);
    if (!c) return false;
    const forest = (c.optionHelpDe['Forest Gnome'] ?? '').toLowerCase();
    const rock = (c.optionHelpDe['Rock Gnome'] ?? '').toLowerCase();
    return /illusion|tiere|animals/.test(forest) && /ausbessern|taschenspielerei|uhrwerk|mending|prestidigitation|clockwork/.test(rock);
  },
  'help ist ein knapper Einzeiler (≤ 120 Zeichen)': (r) => {
    const a = asAnalysis(r);
    const c = a && lineageChoice(a);
    const help = c ? c.helpDe.trim() || c.help.trim() : '';
    return !!help && help.length <= 120 && !/[\n\r]/.test(help);
  },
  // Nur noch Abstammung + ihr Zauberattribut: alles zum Magiekundigen führt der Flow.
  // Mehr heißt: das Modell zerlegt eine Wahl in Unterfragen oder erfindet welche.
  'stellt nicht mehr als zwei Wahlen': (r) => (asAnalysis(r)?.choices.length ?? 99) <= 2,
  'Prosa begründet die Abhängigkeit der Zauber von der Abstammung': (r) => {
    const text = (asAnalysis(r)?.analysisText ?? '').toLowerCase();
    const forest = [...FOREST_GNOME_SPELLS, ...FOREST_GNOME_SPELLS_DE].some((s) => text.includes(s.toLowerCase()));
    const rock = [...ROCK_GNOME_SPELLS, ...ROCK_GNOME_SPELLS_DE].some((s) => text.includes(s.toLowerCase()));
    return forest && rock;
  },
};

// ── Call C: Finalisierung nach der Wahl „Waldgnom" ───────────────────────────────

const finalizeCore: Checks<StepResult> = {
  'ein Rider je Merkmal, in der Reihenfolge des Eingangs': (r) => {
    const fe = asEffects(r);
    if (!fe || fe.riders.length !== EXPECTED_RIDER_NAMES.length) return false;
    return fe.riders.every((rider, i) => rider.featureName.trim() === EXPECTED_RIDER_NAMES[i]);
  },
  'gewährt „Mit Tieren sprechen" (Folge der Waldgnom-Wahl)': (r) => {
    const fe = asEffects(r);
    if (!fe) return false;
    const got = grantedSpells(fe);
    return got.has('speak with animals') || got.has('mit tieren sprechen');
  },
  'gewährt nichts aus dem NICHT gewählten Felsgnom-Zweig': (r) => {
    const fe = asEffects(r);
    if (!fe) return false;
    const got = grantedSpells(fe);
    return ![...ROCK_GNOME_SPELLS, ...ROCK_GNOME_SPELLS_DE].some((s) => got.has(s.toLowerCase()));
  },
  // Frage und Antwort trägt der Code aus dem Übersetzungs-Mapping nach — das Modell liefert
  // nur die id. Erwartet wird daher die deutsche Anzeige, nicht der englische Wert.
  'protokolliert die Abstammungs-Wahl in decisions (deutsch)': (r) => {
    const fe = asEffects(r);
    if (!fe) return false;
    const answers = fe.riders.flatMap((rider) => rider.decisions.map((d) => d.answer));
    return answers.some((a) => new RegExp(`${CHOSEN_LINEAGE_DE}|${CHOSEN_LINEAGE}`, 'i').test(a));
  },
  'featureKey liegt an jedem Rider (Anker für den deutschen Namen)': (r) => {
    const fe = asEffects(r);
    if (!fe) return false;
    return fe.riders.every((rider) => ALL_FEATURE_KEYS.includes(rider.featureKey));
  },
  // Das Talent steht nicht im Eingang: ein Rider dazu wäre erfunden — und würde dem Charakter
  // Zauber erden, die der Spieler erst im Zauber-Schritt selbst wählt.
  'erfindet keinen Rider zum flow-eigenen Magiekundigen': (r) => {
    const fe = asEffects(r);
    if (!fe) return false;
    return !fe.riders.some(
      (rider) => rider.featureKey === MAGIC_INITIATE_KEY || magicInitiateRe.test(rider.featureName),
    );
  },
  // „Vorteil auf Rettungswürfe" ist KEINE Rettungswurf-Übung — der Klassiker, an dem eine
  // Deutung den Bogen verfälscht.
  'deutet Gnomische Gerissenheit nicht als Rettungswurf-Übung': (r) => {
    const fe = asEffects(r);
    return !!fe && fe.riders.every((rider) => rider.proficiencies.savingThrows.length === 0);
  },
  // Pass-C-Regel 7 protokolliert AUSSCHLIESSLICH Wahlen aus <resolved_choices>. Die
  // Zauber-Wahlen des Magiekundigen fallen erst im Zauber-Schritt und sind hier unbeantwortet
  // — ein Protokoll-Eintrag zu ihnen landet mit LEERER Antwort am Charakter (`fillDecisions`
  // findet keine). Gemessen 2026-07-29: passierte in 2 von 3 verwertbaren Läufen.
  'protokolliert keine unbeantwortete Wahl': (r) => {
    const fe = asEffects(r);
    if (!fe) return false;
    return fe.riders.every((rider) => rider.decisions.every((d) => d.answer.trim().length > 0));
  },
  // Kein Merkmal dieses Falls erhöht ein Attribut; die Hintergrund-ASI läuft deterministisch
  // über `backgroundAsi.ts`.
  'trägt keine Attributserhöhung ein': (r) => {
    const fe = asEffects(r);
    if (!fe) return false;
    return fe.riders.every((rider) => Object.values(rider.abilityScoreIncrease).every((v) => v === 0));
  },
};

const finalizeSoft: Checks<StepResult> = {
  // BENANNT, nicht als freier Zaubertrick: „Du beherrschst den Zaubertrick Einfache Illusion"
  // ist ein Grant, keine Wahl. `extraCantrips: 1` würde dem Spieler stattdessen einen freien
  // Zaubertrick schenken — genau das, was Pass-C-Regel 3 ausdrücklich verbietet. Die Prüfung
  // ließ das früher als Erfolg durchgehen.
  'Einfache Illusion kommt als benannter Grant an': (r) => {
    const fe = asEffects(r);
    if (!fe) return false;
    const got = grantedSpells(fe);
    return got.has('minor illusion') || got.has('einfache illusion');
  },
  [`Bogen-Notizen sind einzeilig und ≤ ${SHEET_NOTE_LIMIT} Zeichen`]: (r) => {
    const notes = sheetNotes(r);
    return notes.length > 0 && notes.every(isSheetReady);
  },
  // Größe und Bewegungsrate stehen als eigene Felder im Bogen — eine Notiz dafür ist
  // verschenkter Platz (Regel 10).
  'Größe und Bewegungsrate tragen keine Bogen-Notiz': (r) => {
    const fe = asEffects(r);
    if (!fe) return false;
    return [sizeRe, speedRe].every((re) => (riderFor(fe, re)?.sheetNote ?? '').trim() === '');
  },
  'Angeborene Zauberei trägt eine Bogen-Notiz (Nutzungen/Bonus)': (r) => {
    const fe = asEffects(r);
    return (riderFor(fe ?? { riders: [] }, innateSorceryRe)?.sheetNote ?? '').trim().length > 0;
  },
  'Dunkelsicht-Notiz nennt die deutsche Reichweite (18 m)': (r) => {
    const fe = asEffects(r);
    return /18/.test(riderFor(fe ?? { riders: [] }, darkvisionRe)?.sheetNote ?? '');
  },
  // Die Notiz entsteht englisch und wird übersetzt: sie muss den deutschen
  // Bibliotheksnamen aus dem Glossar tragen, nicht den englischen Rider-Namen.
  'Bogen-Notizen sind deutsch (Merkmalsname aus dem Glossar)': (r) => {
    const fe = asEffects(r);
    const note = riderFor(fe ?? { riders: [] }, darkvisionRe)?.sheetNote ?? '';
    return /dunkelsicht/i.test(note) && !/darkvision/i.test(note);
  },
};

/**
 * Antwortet auf die erkannten Wahlen wie ein Spieler im Merkmals-Schritt: Abstammung →
 * „Waldgnom", jede weitere Wahl mit Optionen → Charisma, sonst die erste Option. Zauber-
 * Wahlen bleiben offen (die fallen im Wizard erst im Zauber-Schritt und sind terminal).
 */
function answerChoices(analysis: FeatureAnalysis): ResolvedChoice[] {
  return analysis.choices
    .filter((c) => c.type !== 'spell-pick' && c.options.length > 0)
    .map((c) => {
      const forest = c.options.find((o) => /forest gnome|waldgnom/i.test(o));
      if (isLineage(c) && forest) return { id: c.id, choice: forest };
      const cha = c.options.find((o) => /charisma/i.test(o));
      return { id: c.id, choice: cha ?? c.options[0] };
    });
}

export async function buildGnomeSorcererCases(): Promise<EvalCase<StepResult>[]> {
  // Eingang über den ECHTEN Wizard-Pfad — keine Handabschrift der Merkmals-Prosa.
  const ctx: FeatureEffectsContext = await loadGnomeSorcererContext();
  if (ctx.features.length !== EXPECTED_RIDER_NAMES.length) {
    throw new Error(
      `[eval] Erwartet ${EXPECTED_RIDER_NAMES.length} Merkmale, geladen ${ctx.features.length} ` +
        '— Vault-Shim aktiv? (vault/species/gnome.json, vault/classes/sorcerer.json, ' +
        'vault/backgrounds/sage.json, vault/feats/magic-initiate.json)',
    );
  }

  return [
    {
      label: 'Call 1 — Analyse: Abstammung offen, Magiekundiger als Zauber-Wahl',
      input: JSON.stringify(ctx),
      run: async (cfg: LlmConfig): Promise<StepResult> => ({
        kind: 'analysis',
        analysis: await analyzeFeatureEffects(cfg, ctx, { noRetry: true }),
      }),
      core: analyzeCore,
      soft: analyzeSoft,
    },
    {
      label: 'Call C — Finalisierung nach „Waldgnom": Zauber gewährt, Wahl protokolliert',
      input: JSON.stringify(ctx),
      // Kette wie im Wizard: kickoff() analysiert, der Merkmals-Schritt sammelt die Antworten
      // ein (commitFeatureChoices), finalizeFeatures() schreibt den Verlauf fort.
      run: async (cfg: LlmConfig): Promise<StepResult> => {
        const analysis = await analyzeFeatureEffects(cfg, ctx, { noRetry: true });
        const resolvedChoices = answerChoices(analysis);
        return {
          kind: 'effects',
          effects: await finalizeFeatureEffects(cfg, { ...ctx, resolvedChoices }, analysis, { noRetry: true }),
        };
      },
      core: finalizeCore,
      soft: finalizeSoft,
    },
  ];
}
