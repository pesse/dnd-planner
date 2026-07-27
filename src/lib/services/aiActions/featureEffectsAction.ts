/**
 * KI-Aktion für die Deutung neu gewonnener Merkmale/Talente beim Stufenaufstieg.
 *
 * Bekommt AUSSCHLIESSLICH die in dieser Spanne neu gewonnenen Merkmale (Basis-,
 * Subklassen- oder Talent-Prosa) und extrahiert daraus die konkreten mechanischen
 * Effekte („Rider") sowie die erzwungenen Spielerwahlen.
 *
 * QM-only, in ZWEI vom Level-Up-Flow getriebenen Phasen (der Checkpoint sitzt
 * dazwischen, damit der User direkt nach Call 1 entscheidet):
 *   analyzeFeatureEffects  = Call 1 (Pass A, Reasoning): reine Analyse → Choices
 *     (Möglichkeiten) + zu erdende Zauber. KEIN Rider-Vokabular.
 *   [Checkpoint]           = der Flow zeigt die Choices, der User entscheidet.
 *   finalizeFeatureEffects = Grounding (mit bekannter Entscheidung) + Pass C (Guided):
 *     Rider, die die GETROFFENE Entscheidung tragen — keine Optionslisten.
 * Prompts ENGLISCH; nur nutzer-sichtbare Feldinhalte DE.
 */
import {
  featureEffectsJsonSchema,
  parseFeatureEffects,
  type FeatureEffects,
} from '../../schemas/levelUp';
import type { LlmConfig } from '../../types';
import type { ChatMessage } from '../llmService';
import { qualitymindsChat, qualitymindsGenerateStructuredFromMessages, TASK_TEMPERATURE } from '../llmService';
import { getSpellLibrary } from '../../spellLibrary';
import { resolveSpell } from '../levelUpMachine';
import { stripJsonFence } from '../jsonFence';

/** Einheitliche Eingabe-Einheit für die Effekt-Deutung (Merkmal ODER Talent). */
export interface GainedFeature {
  name: string;
  desc: string;
  source: 'class' | 'subclass' | 'feat';
  gainedAt: number;
  key?: string; // Open5e-v2-Schlüssel des Merkmals (Provenienz im LevelUp-Dokument)
}

/** Knapper Klassen-Kontext für die Effekt-Deutung. */
export interface FeatureClassContext {
  klasseName: string;
  casterType: string; // FULL/HALF/NONE/…
  casterKind: 'prepared' | 'known' | 'none';
  spellcastingAbility: string;
  toLevel: number;
}

/**
 * Pass-C-Prompt (Guided, non-reasoning): gießt die Analyse ins Rider-Schema. Alle Wahlen
 * sind zu diesem Zeitpunkt bereits getroffen (<resolved_choices>) — dieser Call trägt nur
 * die ERGEBNISSE ein und protokolliert die getroffenen Entscheidungen.
 */
const FEATURE_EFFECTS_SYSTEM = `You are a rules assistant for Dungeons & Dragons 5e (SRD 5.2 / German 5.2.1 terminology).
You are given the game features/feats a character has JUST gained (<gained_features>) plus class context, an analysis of them, the player's already-made choices (<resolved_choices>) and resolved spell lookups.
Turn all of that into the concrete, app-modellable mechanical effects each feature grants — a list of typed "riders". Every forced choice is ALREADY MADE; never emit unmade choices or option lists.

## Rules
1. Emit a rider ONLY for a feature that carries a concrete mechanical grant. Purely narrative/flavor features → no rider.
2. grantedSpells: spells a feature makes ALWAYS PREPARED / grants for free (subclass/circle/domain lists, spell-granting feats), already reflecting the resolved choice. Canonical ENGLISH SRD names. NEVER spells the player merely MAY learn.
3. extraCantrips / extraPreparedCount: only if a feature explicitly grants additional cantrips resp. lets the player prepare MORE spells than the class table already does.
4. expertiseSkills: the CHOSEN skills that gain Expertise (double proficiency), taken from <resolved_choices>. Never a list of options.
5. proficiencies: skills/tools/weapons/armor/languages/savingThrows the feature grants (short names).
6. abilityScoreIncrease: ability increases the feature dictates — FIXED ones (e.g. a feat giving +1 CON) AND any resolved "+1 to one of…" choice from <resolved_choices>. NEVER the generic ASI (handled separately). German keys: str, ges (dex), kon, int, wei (wis), cha.
7. decisions: for EVERY entry in <resolved_choices> that this feature triggered, add one decision {id, question, answer} — the German question and the chosen German label(s). This is the record of what the player picked (e.g. a fighting style, a Circle of the Land terrain). Bake its mechanical consequence into the grant fields above; the decision itself is the audit record.
8. Do NOT restate deterministic numbers (spell slots, proficiency bonus, hit die) — applied automatically. Only add value the raw table cannot express.
9. If nothing is modellable, return an empty "riders" array.`;

/**
 * Pass-A-Prompt (Reasoning): REINE Analyse. Bewusst OHNE Rider-Vokabular — der Fokus liegt
 * auf den Dingen, die deterministisch weiterverarbeitet werden: ALLE erzwungenen Spieler-
 * wahlen (mit Optionen) und die als immer-vorbereitet gewährten Zauber (zum Erden). Alles
 * Übrige bleibt Prosa und wird erst von Pass C ins Schema übernommen.
 */
export const FEATURE_EFFECTS_ANALYSIS_SYSTEM = `You are a rules analyst for Dungeons & Dragons 5e (SRD 5.2 / German 5.2.1 terminology).
You receive the game features/feats a character has JUST gained (<gained_features>) plus class context (<class_context>), and optionally choices the player has already made (<resolved_choices>).
Your ONLY job is to ANALYSE these features so a later deterministic step and a separate formatting step can turn your analysis into concrete mechanics. Do NOT produce any final data structures or grants here — reason in prose and end with one compact manifest.

## What to work out
1. Forced player choices: EVERY choice a feature forces on the player — a subclass option, a terrain, a fighting style, an Expertise skill selection, "+1 to one of several abilities", pick a spell from a list, etc. For each, note the German question, the concrete options if you know them, how many may be picked (max), and whether the choice DETERMINES further mechanical effects that cannot be stated until it is made (e.g. a Circle of the Land terrain decides which spells are granted).
2. Mechanical dependencies: state clearly which grants depend on which choice and which grants are unconditional.
3. Spells granted as ALWAYS PREPARED for free (subclass/circle/domain lists, spell-granting feats) — canonical ENGLISH SRD names. List a spell ONLY once no still-open choice blocks it. Never list spells the player merely MAY learn.
4. Any other concrete mechanical grants (proficiencies, fixed ability increases, extra cantrips/prepared spells) — describe them in prose. You do NOT need to structure these; the next step reads your prose.

## <resolved_choices>
If present, each listed choice is FINAL: it no longer blocks anything and the spells/effects it unlocks can now be stated (canonical English spell names). Still list such a choice in the manifest, but set its determinesFurtherEffects=false.

## Output
Reason in prose first. Then end your answer with EXACTLY ONE fenced JSON manifest and nothing after it:
\`\`\`json
{
  "choices": [
    { "id": "choice_<featureslug>_1", "feature": "<feature name>", "question": "<German question>", "type": "choice", "options": ["<German option>"], "max": 1, "determinesFurtherEffects": true }
  ],
  "spellsToGround": ["Canonical English Spell Name"],
  "blocked": false
}
\`\`\`
- choices: EVERY forced player choice (incl. fighting style, expertise). Stable ids. type = "choice" (pick one), "multiselect" (pick max), or "text" (free). options=[] if free text. max = how many may be picked (1 for single). determinesFurtherEffects=true only when the answer unlocks grants you cannot state yet.
- spellsToGround: canonical ENGLISH names of always-prepared spell grants to resolve NOW (empty [] if none or if blocked).
- blocked: true if a determinesFurtherEffects choice is still open (not yet in <resolved_choices>) and therefore blocks stating spell grants.`;

/**
 * userInput für die Effekt-Deutung (XML-gegliedert, JSON-Inhalt).
 *
 * Bewusst OHNE Charakter-Zusammenfassung: der Effekt-Prompt deutet ausschließlich
 * die Merkmals-Prosa + Klassen-Kontext (Caster-Art, Zielstufe). Attribute/Slots/HP
 * des konkreten Charakters sind hier irrelevant und nur Token-Ballast/Ablenkung.
 */
export function buildFeatureEffectsInput(ctx: {
  classContext: FeatureClassContext;
  features: GainedFeature[];
  resolvedChoices?: { feature: string; prompt: string; choice: string }[];
}): string {
  const parts = [
    `<class_context>${JSON.stringify(ctx.classContext)}</class_context>`,
    `<gained_features>${JSON.stringify(ctx.features)}</gained_features>`,
  ];
  if (ctx.resolvedChoices?.length)
    parts.push(`<resolved_choices>${JSON.stringify(ctx.resolvedChoices)}</resolved_choices>`);
  return parts.join('\n');
}

/** Eingabe-Bündel für den Orchestrator (identisch zu `buildFeatureEffectsInput`). */
export interface FeatureEffectsContext {
  classContext: FeatureClassContext;
  features: GainedFeature[];
  resolvedChoices?: { feature: string; prompt: string; choice: string }[];
}

/** Optionen für die beiden Effekt-Phasen. */
export interface FeatureEffectsRunOptions {
  /** Lebenszeichen pro Streaming-Delta (für die Stuck-Erkennung der UI). */
  onActivity?: () => void;
  signal?: AbortSignal;
  /**
   * Kein Nachbesserungs-Call, wenn Pass C kein schema-valides JSON liefert. Standard: false
   * (Prod macht genau EINEN Retry). Für Prompt-Qualitäts-Evals true, damit die First-Try-
   * Qualität des Prompts gemessen wird und nicht der Retry sie kaschiert.
   */
  noRetry?: boolean;
}

/** Eine von Pass A erkannte, erzwungene Spielerwahl (Möglichkeiten — treibt den Checkpoint). */
export interface AnalysisChoice {
  id: string;
  feature: string;
  question: string;
  type: 'choice' | 'multiselect' | 'text';
  options: string[];
  max: number;
  determinesFurtherEffects: boolean;
}

/** Ergebnis von Call 1: die Analyse, die den Entscheidungs-Checkpoint speist. */
export interface FeatureAnalysis {
  choices: AnalysisChoice[];
  spellsToGround: string[];
  blocked: boolean;
  /** Rohe Pass-A-Prosa — wird an Pass C durchgereicht, wenn keine Neu-Analyse nötig ist. */
  analysisText: string;
}

/** Schlankes Manifest, das Pass A am Ende der freien Analyse deklariert (nur deterministisch Nötiges). */
interface EffectsManifest {
  choices: AnalysisChoice[];
  spellsToGround: string[];
  blocked: boolean;
}

/** Normalisiert einen rohen Choice-Eintrag aus dem Manifest; verwirft, was keine Frage trägt. */
function normalizeChoice(raw: unknown): AnalysisChoice | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.question !== 'string' || !o.question.trim()) return null;
  const slug = `choice_${o.question}`.toLowerCase().replace(/\W+/g, '_').slice(0, 40);
  const type = o.type === 'multiselect' || o.type === 'text' ? o.type : 'choice';
  return {
    id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : slug,
    feature: typeof o.feature === 'string' ? o.feature : '',
    question: o.question,
    type,
    options: Array.isArray(o.options) ? o.options.filter((x): x is string => typeof x === 'string') : [],
    max: typeof o.max === 'number' && o.max > 0 ? Math.floor(o.max) : 1,
    determinesFurtherEffects: o.determinesFurtherEffects === true,
  };
}

/**
 * Zieht das Manifest aus der (Prosa + Fenced-JSON-)Antwort von Pass A. Bewusst tolerant:
 * bevorzugt den LETZTEN ```json-Block, sonst das letzte `{…}`; bei Fehlschlag sicherer
 * Default (keine Choices, keine Zauber, nicht blockiert).
 */
function parseManifest(text: string): EffectsManifest {
  const empty: EffectsManifest = { choices: [], spellsToGround: [], blocked: false };
  const jsonBlocks = [...text.matchAll(/```json\s*([\s\S]*?)```/gi)].map((m) => m[1]);
  for (const candidate of [jsonBlocks.at(-1), text.match(/\{[\s\S]*\}/)?.[0]]) {
    if (!candidate) continue;
    try {
      const o = JSON.parse(stripJsonFence(candidate)) as Record<string, unknown>;
      return {
        choices: Array.isArray(o.choices)
          ? o.choices.map(normalizeChoice).filter((c): c is AnalysisChoice => c !== null)
          : [],
        spellsToGround: Array.isArray(o.spellsToGround)
          ? o.spellsToGround.filter((s): s is string => typeof s === 'string')
          : [],
        blocked: o.blocked === true,
      };
    } catch {
      /* nächsten Kandidaten versuchen */
    }
  }
  return empty;
}

/**
 * Löst die zu erdenden Zaubernamen gegen die VOLLE Bibliothek auf (nie klassengefiltert,
 * damit off-list-Unterklassen-/Domänen-Grants nicht verworfen werden) und liefert eine
 * annotierte `<spell_resolution>`-Zeile — nur Fakten (kanonischer Name + Level bzw. „nicht
 * gefunden"), kein Ausschluss. Leer, wenn nichts aufzulösen ist.
 */
async function buildSpellResolution(spellsToGround: string[], klasseName: string): Promise<string> {
  if (!spellsToGround.length) return '';
  const library = await getSpellLibrary();
  const lines = spellsToGround.map((name) => {
    const info = resolveSpell(library, name, klasseName);
    return info
      ? `${name} → ${info.name_en ?? info.name} (Level ${info.level})`
      : `${name} → NICHT in Bibliothek gefunden`;
  });
  return `<spell_resolution>\n${lines.join('\n')}\n</spell_resolution>`;
}

/** Baut die abschließende Transkriptions-Anweisung für Pass C aus dem Grounding. */
function buildTranscriptionInstruction(spellResolution: string): string {
  const parts = [
    'Gib jetzt das Ergebnis exakt im geforderten Schema aus. Trage jede in <resolved_choices> ' +
      'genannte Wahl in decisions[] des passenden Riders ein (question + gewählte Antwort) und lasse ' +
      'ihr Ergebnis in die konkreten Grants einfließen (grantedSpells / expertiseSkills / abilityScoreIncrease).',
  ];
  if (spellResolution) {
    parts.push(
      'Nutze für grantedSpells ausschließlich die kanonischen englischen Namen aus <spell_resolution>; ' +
        'als NICHT gefunden markierte Namen überdenken, nicht erzwingen.\n' +
        spellResolution,
    );
  }
  return parts.join('\n\n');
}

/** Wirft, wenn der Provider nicht QualityMinds ist (Effekt-Deutung ist bewusst QM-only). */
function guardQualityMinds(config: LlmConfig): void {
  if (config.provider !== 'qualityminds')
    throw new Error(
      'Merkmals-Effekte laufen nur über den QualityMinds-Pfad (Reasoning + Grounding + Structured). ' +
        'Bitte ein QualityMinds-Modell wählen.',
    );
}

/** Pass A: freie Reasoning-Analyse → Prosa + geparstes Manifest. */
async function reason(
  config: LlmConfig,
  input: string,
  opts: FeatureEffectsRunOptions,
): Promise<{ text: string; manifest: EffectsManifest }> {
  const text = await qualitymindsChat(
    config,
    [
      { role: 'system', content: FEATURE_EFFECTS_ANALYSIS_SYSTEM },
      { role: 'user', content: input },
    ],
    TASK_TEMPERATURE.structured,
    () => opts.onActivity?.(),
    opts.signal,
  );
  return { text, manifest: parseManifest(text) };
}

/**
 * Call 1 — reine Analyse: liefert die erkannten Choices (Möglichkeiten) + zu erdende Zauber.
 * Der Level-Up-Flow zeigt daraus den Entscheidungs-Checkpoint DIREKT nach diesem Call.
 */
export async function analyzeFeatureEffects(
  config: LlmConfig,
  ctx: FeatureEffectsContext,
  opts: FeatureEffectsRunOptions = {},
): Promise<FeatureAnalysis> {
  guardQualityMinds(config);
  const { text, manifest } = await reason(config, buildFeatureEffectsInput(ctx), opts);
  return { choices: manifest.choices, spellsToGround: manifest.spellsToGround, blocked: manifest.blocked, analysisText: text };
}

/**
 * Call C — Grounding + Pass C: gießt die Analyse (jetzt mit getroffenen Entscheidungen)
 * ins Rider-Schema. Sind Entscheidungen gefallen (`ctx.resolvedChoices`), reasoniert dieser
 * Schritt einmal neu, damit choice-abhängige Zauber benannt werden; sonst nutzt er die
 * Analyse aus Call 1 direkt weiter.
 */
export async function finalizeFeatureEffects(
  config: LlmConfig,
  ctx: FeatureEffectsContext,
  analysis: FeatureAnalysis,
  opts: FeatureEffectsRunOptions = {},
): Promise<FeatureEffects> {
  guardQualityMinds(config);
  const input = buildFeatureEffectsInput(ctx);

  // Mit getroffener Wahl neu reasonieren (choice-abhängige Zauber werden erst jetzt benannt);
  // ohne Wahl die Analyse aus Call 1 direkt weiterverwenden (spart einen Reasoning-Call).
  const { text, manifest } = ctx.resolvedChoices?.length
    ? await reason(config, input, opts)
    : {
        text: analysis.analysisText,
        manifest: { choices: analysis.choices, spellsToGround: analysis.spellsToGround, blocked: analysis.blocked },
      };

  // Deterministisch: genannte Zauber gegen die Bibliothek erden (entfällt bei offener Wahl).
  const spellResolution = manifest.blocked
    ? ''
    : await buildSpellResolution(manifest.spellsToGround, ctx.classContext.klasseName);

  // Pass C — Guided über den Verlauf: Analyse + Entscheidungen + geerdete Zauber ins Schema.
  const messages: ChatMessage[] = [
    { role: 'system', content: FEATURE_EFFECTS_SYSTEM },
    { role: 'user', content: input },
    { role: 'assistant', content: text },
    { role: 'user', content: buildTranscriptionInstruction(spellResolution) },
  ];

  const runPassC = async (): Promise<FeatureEffects | null> => {
    try {
      const raw = await qualitymindsGenerateStructuredFromMessages(config, messages, featureEffectsJsonSchema, {
        signal: opts.signal,
      });
      return parseFeatureEffects(raw);
    } catch (e) {
      if (opts.signal?.aborted) throw e; // Abbruch nie verschlucken
      return null;
    }
  };

  // Prod macht genau EINEN Retry bei ungültigem JSON; die Eval misst die First-Try-Qualität.
  let result = await runPassC();
  if (!result && !opts.noRetry) result = await runPassC();
  if (!result) throw new Error('Die KI lieferte keine schema-validen Merkmals-Effekte.');
  return result;
}
