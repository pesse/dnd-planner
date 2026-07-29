/**
 * Deutung neu gewonnener Merkmale/Talente: aus der Regelprosa die mechanischen Effekte
 * („Rider"), die erzwungenen Spielerwahlen und je Merkmal eine `sheetNote` fürs PDF.
 *
 * ZWEI Calls mit Checkpoint dazwischen, damit der User direkt nach der Analyse entscheidet:
 * `analyzeFeatureEffects` (Reasoning, bewusst ohne Rider-Vokabular) → der Flow zeigt die
 * Choices → `finalizeFeatureEffects` (Nach-Analyse im Verlauf + Grounding + Guided).
 * QM-only, Prompts englisch.
 *
 * Die Verdichtungs-Doktrin der `sheetNote` liegt in `fieldSummaryAction`
 * (`SHEET_NOTE_DOCTRINE`) — dieselbe Regel trägt die Feld-Zusammenfassung im
 * Charakter-Editor, und sie soll nur an einer Stelle optimiert werden.
 *
 * Zwei Details tragen die Qualität messbar (evals/featureAnalysis.eval.test.ts): jedes
 * Merkmal geht mit EN- *und* DE-Text rein (EN = Regelquelle, DE = die Begriffe, in denen
 * Fragen und Optionen formuliert werden), und die getroffenen Wahlen kommen als eigener
 * Folge-Turn statt im Erst-Prompt.
 */
import {
  featureEffectsJsonSchema,
  parseFeatureEffects,
  SHEET_NOTE_MAX_CHARS,
  type FeatureEffects,
} from '../../schemas/levelUp';
import { SHEET_NOTE_DOCTRINE } from './fieldSummaryAction';
import { ARMOR_TRAININGS, SKILL_NAMES, WEAPON_CATEGORIES } from '../../schemas/shared';
import type { LlmConfig } from '../../types';
import type { ChatMessage } from '../llmService';
import { qualitymindsChat, qualitymindsGenerateStructuredFromMessages, TASK_TEMPERATURE } from '../llmService';
import { getSpellLibrary } from '../../spellLibrary';
import { resolveSpell } from '../levelUpMachine';
import type { PastChoice } from '../characterFeatures';
import { stripJsonFence } from '../jsonFence';

/** Einheitliche Eingabe-Einheit für die Effekt-Deutung (Merkmal ODER Talent). */
export interface GainedFeature {
  name: string;
  desc: string; // Original-Regeltext (EN) — maßgeblich für die Mechanik
  descDe?: string; // Übersetzung — liefert die deutschen Begriffe für Fragen/Optionen
  source: 'class' | 'subclass' | 'feat' | 'species';
  gainedAt: number;
  key?: string; // Open5e-v2-Schlüssel des Merkmals (Provenienz im LevelUp-Dokument)
  choice?: string; // Bereits getroffene Entscheidung — verhindert, dass sie erneut gefragt wird
}

/**
 * Antwort auf eine erkannte Wahl. Bewusst MINIMAL: Frage, Optionen und Merkmal stehen
 * schon im Verlauf — sie erneut mitzuschicken lädt nur zu Widersprüchen ein.
 */
export interface ResolvedChoice {
  id: string;
  choice: string;
}

/** Knapper Klassen-Kontext für die Effekt-Deutung. */
export interface FeatureClassContext {
  klasseName: string;
  /** Leer, wenn die Klasse noch keine hat — bei der Merkmals-Deutung ist die Wahl aber
   *  immer schon gefallen, nie eine offene Frage. */
  subclassName: string;
  casterType: string; // FULL/HALF/NONE/…
  casterKind: 'prepared' | 'known' | 'none';
  spellcastingAbility: string;
  toLevel: number;
}

/**
 * Pass-C-Prompt (Guided): gießt die Analyse ins Rider-Schema, trägt nur ERGEBNISSE ein,
 * keine Optionslisten. Die `sheetNote` (Regel 10) entsteht hier, weil nur dieser Call
 * EN-Prosa, getroffene Wahlen und eigene Grants zugleich sieht — und daher weiß, was der
 * Bogen schon anderswo führt und deshalb keine Zeile braucht.
 */
const FEATURE_EFFECTS_SYSTEM = `You are a rules assistant for Dungeons & Dragons 5e (SRD 5.2 / German 5.2.1 terminology).
The conversation above contains the game features/feats a character has JUST gained (<gained_features>, each with the English rules text "desc" and its German translation "descDe") plus class context, your analysis of them, the player's answers to the forced choices (<resolved_choices>) and the re-done analysis that takes those answers into account. Resolved spell lookups follow below.
Turn all of that into the concrete, app-modellable mechanical effects each feature grants — a list of typed "riders" — plus one terse German sheet note per feature. Every forced choice is ALREADY MADE; never emit unmade choices or option lists.

## Rules
1. Emit EXACTLY ONE rider per entry in <gained_features>, in the same order, with featureName copied verbatim. A feature without any mechanical grant still gets its rider — leave the grant fields at their empty defaults and only fill sheetNote (see rule 10). Never invent a rider for a feature that is not in <gained_features>.
2. grantedSpells: spells a feature makes ALWAYS PREPARED / grants for free (subclass/circle/domain lists, spell-granting feats), already reflecting the resolved choice. Canonical ENGLISH SRD names. NEVER spells the player merely MAY learn.
3. extraCantrips / extraPreparedCount: only if a feature explicitly grants additional cantrips resp. lets the player prepare MORE spells than the class table already does.
4. expertiseSkills: the CHOSEN skills that gain Expertise (double proficiency), taken from <resolved_choices>. Never a list of options. Use the canonical English skill names listed in rule 5.
5. proficiencies: what the feature grants, in CLOSED vocabularies — anything outside them cannot be recorded on the character sheet:
   - skills: exactly one of ${SKILL_NAMES.join(', ')}.
   - weapons: ${WEAPON_CATEGORIES.join(' or ')} (a restricted grant such as "Martial weapons with the Light property" is NOT a category — leave weapons empty and describe it in sheetNote).
   - armor: ${ARMOR_TRAININGS.join(', ')}.
   - savingThrows: the full English ability name (Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma).
   - tools / languages: free text, English.
6. abilityScoreIncrease: ability increases the feature dictates — FIXED ones (e.g. a feat giving +1 CON) AND any resolved "+1 to one of…" choice from <resolved_choices>. NEVER the generic ASI (handled separately). German keys: str, ges (dex), kon, int, wei (wis), cha.
7. decisions: for EVERY entry in <resolved_choices> that this feature triggered, add one decision {id, question, answer}. <resolved_choices> only carries {id, choice} — take the id verbatim, look the matching German question up in your own analysis (same id) and use the chosen German label(s) as the answer. This is the record of what the player picked (e.g. a Circle of the Land terrain). Bake its mechanical consequence into the grant fields above; the decision itself is the audit record.
8. Do NOT restate deterministic numbers (spell slots, proficiency bonus, hit die) — applied automatically. Only add value the raw table cannot express.
9. Never invent mechanics that are not in the feature's own rules text. When in doubt, leave a field empty.

## sheetNote (rule 10)
10. sheetNote is that entry for THIS feature, squeezed into ONE line for the "Klassenmerkmale" field: no line breaks, no markdown, max ~${SHEET_NOTE_MAX_CHARS} characters — the player's own free text is merged with it later. Empty string ("") where the doctrine below wants no entry. Here, "an option the player picked" means an entry in <resolved_choices>; that choice is also stored structurally (it comes back as <past_choices> on later level-ups), so it only earns a note when it adds an ongoing mechanic.

${SHEET_NOTE_DOCTRINE}`;

/**
 * Pass-A-Prompt (Reasoning): reine Analyse, bewusst OHNE Rider-Vokabular. Strukturiert
 * werden nur die deterministisch weiterverarbeiteten Dinge — Spielerwahlen und zu erdende
 * Zauber; alles Übrige bleibt Prosa für Pass C.
 */
export const FEATURE_EFFECTS_ANALYSIS_SYSTEM = `You are a rules analyst for Dungeons & Dragons 5e (SRD 5.2 / German 5.2.1 terminology).
You receive the game features/feats a character has JUST gained (<gained_features>) plus class context (<class_context>). Each feature carries the original English rules text in "desc" and its German translation in "descDe": "desc" is the authoritative source for the mechanics, "descDe" gives you the German wording for questions and options.
Your ONLY job is to ANALYSE these features so a later deterministic step and a separate formatting step can turn your analysis into concrete mechanics. Do NOT produce any final data structures or grants here — reason in prose and end with one compact manifest.

## What to work out
1. Forced player choices: EVERY choice a feature forces on the player — a subclass option, a terrain, an Expertise skill selection, "+1 to one of several abilities", pick a spell from a list, etc. (Weapon Mastery and Fighting Style are handled OUTSIDE this analysis — the flow offers those from the library, so their features never reach you here.) For each, note the German question, the concrete options if you know them, how many may be picked (max), and whether the choice DETERMINES further mechanical effects that cannot be stated until it is made (e.g. a Circle of the Land terrain decides which spells are granted). Three rules on top:
   - **featureKey**: copy the "key" of the emitting feature VERBATIM from <gained_features>. Never invent, shorten or translate it. Empty string only if that feature carries no key.
   - **Option wording**: give each option as the German label EXACTLY as the feature's "descDe" writes it (for a bolded option paragraph \`**Wächter.**\` the option is \`Wächter\`). The stored answer is later matched back against that text, so do not paraphrase, expand or re-case it.
   - **isBuildDecision**: true only for a PERMANENT character-building choice (Primal Order, Divine Order, Expertise skills, an elven lineage, a terrain, metamagic options). false for options the player picks anew on each USE of the feature (Channel Divinity's Divine Spark vs Turn Undead, Cunning Strike effects, Brutal Strike effects) — those still need asking when the feature demands it now, but they are not part of the character's build.
2. Mechanical dependencies: state clearly which grants depend on which choice and which grants are unconditional.
3. Spells granted as ALWAYS PREPARED for free (subclass/circle/domain lists, spell-granting feats) — canonical ENGLISH SRD names. List a spell ONLY once no still-open choice blocks it. Never list spells the player merely MAY learn.
4. Any other concrete mechanical grants (proficiencies, fixed ability increases, extra cantrips/prepared spells) — describe them in prose. You do NOT need to structure these; the next step reads your prose.

## <past_choices>
May be present: build decisions this character made at EARLIER levels, as {"featureKey", "feature", "choice"}. They are FINAL — never ask about them again, and treat their consequences as already in place (a druid who chose Warden has Martial weapon proficiency and Medium armor training). Use them when a new feature builds on an older choice.

## <resolved_choices>
The player answers in a LATER turn, as a compact list of {"id": "<the id from your manifest>", "choice": "<the German label the player picked>"} — nothing else. When that turn arrives, REDO the analysis with those answers baked in:
- Each listed choice is FINAL: it no longer blocks anything, so the spells/effects it unlocks can now be stated (canonical English spell names).
- Keep every choice in the manifest under its ORIGINAL id, but set its determinesFurtherEffects=false.
- Emit the full prose + manifest again; set blocked=false once nothing is open any more.

## Output
Reason in prose first. Then end your answer with EXACTLY ONE fenced JSON manifest and nothing after it:
\`\`\`json
{
  "choices": [
    { "id": "choice_<featureslug>_1", "feature": "<feature name>", "featureKey": "<key verbatim from <gained_features>>", "question": "<German question>", "type": "choice", "options": ["<German option>"], "help": "<short German summary of the options' consequences>", "optionHelp": { "<German option>": "<its concrete German consequence>" }, "max": 1, "determinesFurtherEffects": true, "isBuildDecision": true }
  ],
  "spellsToGround": ["Canonical English Spell Name"],
  "blocked": false
}
\`\`\`
- choices: EVERY forced player choice (incl. expertise). Stable ids. type = "choice" (pick one), "multiselect" (pick max), or "text" (free). options=[] if free text. max = how many may be picked (1 for single). determinesFurtherEffects=true only when the answer unlocks grants you cannot state yet. featureKey and isBuildDecision as specified above.
  - help: a SHORT German one-liner (≤120 chars) summarising the MECHANICAL consequences of the options, so the player understands the trade-off (e.g. "Wächter → Kriegswaffen + mittlere Rüstung; Magier → ein zusätzlicher bekannter Zaubertrick" or "bestimmt Schadensart von Odemwaffe und Resistenz"). Empty string if the options carry no notable consequence.
  - optionHelp: an object mapping EACH option label (verbatim, same string as in "options") to its own concrete German consequence (≤60 chars each), whenever the options differ mechanically — e.g. for Draconic Ancestry {"Schwarz": "Säureschaden", "Blau": "Blitzschaden", "Rot": "Feuerschaden"}. Use {} when the options carry no per-option consequence (e.g. picking Expertise skills).
- spellsToGround: canonical ENGLISH names of always-prepared spell grants to resolve NOW (empty [] if none or if blocked).
- blocked: true if a determinesFurtherEffects choice is still open (not yet in <resolved_choices>) and therefore blocks stating spell grants.`;

/**
 * Bewusst OHNE Charakter-Zusammenfassung: gedeutet wird nur Merkmals-Prosa + Klassen-
 * Kontext. Attribute/Slots/HP wären hier Token-Ballast und Ablenkung.
 */
export function buildFeatureEffectsInput(ctx: {
  classContext: FeatureClassContext;
  features: GainedFeature[];
  pastChoices?: PastChoice[];
}): string {
  return [
    `<class_context>${JSON.stringify(ctx.classContext)}</class_context>`,
    `<gained_features>${JSON.stringify(ctx.features)}</gained_features>`,
    ...(ctx.pastChoices?.length ? [`<past_choices>${JSON.stringify(ctx.pastChoices)}</past_choices>`] : []),
  ].join('\n');
}

/** Mehr als `{id, choice}` verschlechtert hier die Antwortqualität messbar. */
export function buildResolvedChoicesTurn(choices: ResolvedChoice[]): string {
  const minimal = choices.map(({ id, choice }) => ({ id, choice }));
  return `<resolved_choices>${JSON.stringify(minimal)}</resolved_choices>`;
}

export interface FeatureEffectsContext {
  classContext: FeatureClassContext;
  features: GainedFeature[];
  pastChoices?: PastChoice[]; // schon festgelegte Wahlen früherer Stufen
  resolvedChoices?: ResolvedChoice[]; // nur für finalizeFeatureEffects
}

export interface FeatureEffectsRunOptions {
  onActivity?: () => void; // Lebenszeichen pro Streaming-Delta (Stuck-Erkennung der UI)
  signal?: AbortSignal;
  /** Für Prompt-Evals true: sonst kaschiert der Retry die First-Try-Qualität des Prompts. */
  noRetry?: boolean;
}

/** Eine erkannte, erzwungene Spielerwahl — treibt den Checkpoint. */
export interface AnalysisChoice {
  id: string;
  feature: string;
  /** Bibliotheks-Key des Merkmals — Anker, unter dem die Antwort am Charakter landet. */
  featureKey: string;
  question: string;
  type: 'choice' | 'multiselect' | 'text';
  options: string[];
  /** Knappe deutsche Zusammenfassung der Konsequenzen (Tooltip); leer, wenn keine. */
  help: string;
  /** Je Option (Schlüssel = Options-Label) ihre konkrete deutsche Konsequenz, z.B. „Schwarz"→„Säureschaden". */
  optionHelp: Record<string, string>;
  max: number;
  determinesFurtherEffects: boolean;
  /** false = Wahl pro Einsatz (Kanalisierte Göttlichkeit u.ä.) → wird nicht protokolliert. */
  isBuildDecision: boolean;
}

export interface FeatureAnalysis {
  choices: AnalysisChoice[];
  spellsToGround: string[];
  blocked: boolean;
  analysisText: string; // rohe Pass-A-Prosa, geht so an Pass C
}

/** Das JSON, das Pass A am Ende seiner Prosa deklariert. */
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
    featureKey: typeof o.featureKey === 'string' ? o.featureKey.trim() : '',
    question: o.question,
    type,
    options: Array.isArray(o.options) ? o.options.filter((x): x is string => typeof x === 'string') : [],
    help: typeof o.help === 'string' ? o.help.trim() : '',
    optionHelp:
      o.optionHelp && typeof o.optionHelp === 'object' && !Array.isArray(o.optionHelp)
        ? Object.fromEntries(
            Object.entries(o.optionHelp as Record<string, unknown>)
              .filter(([, v]) => typeof v === 'string' && v.trim())
              .map(([k, v]) => [k, (v as string).trim()]),
          )
        : {},
    max: typeof o.max === 'number' && o.max > 0 ? Math.floor(o.max) : 1,
    determinesFurtherEffects: o.determinesFurtherEffects === true,
    // Vorsichtiger Default: eine nicht als Aufbau-Wahl markierte Antwort wird nur
    // protokolliert, wenn das Modell es ausdrücklich sagt — sonst wächst das Ledger
    // mit Taktik-Optionen zu.
    isBuildDecision: o.isBuildDecision === true,
  };
}

/**
 * Bewusst tolerant, weil die Antwort Prosa UND JSON enthält: letzter ```json-Block, sonst
 * das letzte `{…}`; bei Fehlschlag der harmlose Default statt eines Fehlers.
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
 * Auflösung gegen die VOLLE Bibliothek, nie klassengefiltert — sonst fallen off-list-
 * Grants von Unterklassen und Domänen weg. Liefert nur Fakten, schließt nichts aus.
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

function buildTranscriptionInstruction(spellResolution: string): string {
  const parts = [
    'Gib jetzt das Ergebnis exakt im geforderten Schema aus — genau ein Rider je Merkmal aus ' +
      '<gained_features>, in derselben Reihenfolge. Trage jede in <resolved_choices> ' +
      'genannte Wahl in decisions[] des passenden Riders ein — id wie dort, question aus deiner ' +
      'Analyse mit derselben id, answer = das gewählte Label — und lasse ihr Ergebnis in die ' +
      'konkreten Grants einfließen (grantedSpells / expertiseSkills / abilityScoreIncrease).\n' +
      'Setze sheetNote nur dort, wo der Charakterbogen die Information wirklich braucht (Regel 10); ' +
      'sonst leer lassen. Kurz halten — der Platz im PDF-Feld ist knapp.',
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

/** QM-only, weil der Pfad Reasoning + Grounding + Guided Output in einem Verlauf braucht. */
function guardQualityMinds(config: LlmConfig): void {
  if (config.provider !== 'qualityminds')
    throw new Error(
      'Merkmals-Effekte laufen nur über den QualityMinds-Pfad (Reasoning + Grounding + Structured). ' +
        'Bitte ein QualityMinds-Modell wählen.',
    );
}

/** `turns` ist der Analyse-Verlauf OHNE System-Prompt. */
async function reason(
  config: LlmConfig,
  turns: ChatMessage[],
  opts: FeatureEffectsRunOptions,
): Promise<{ text: string; manifest: EffectsManifest }> {
  const text = await qualitymindsChat(
    config,
    [{ role: 'system', content: FEATURE_EFFECTS_ANALYSIS_SYSTEM }, ...turns],
    TASK_TEMPERATURE.structured,
    () => opts.onActivity?.(),
    opts.signal,
  );
  return { text, manifest: parseManifest(text) };
}

/** Call 1 — der Flow zeigt den Entscheidungs-Checkpoint direkt danach. */
export async function analyzeFeatureEffects(
  config: LlmConfig,
  ctx: FeatureEffectsContext,
  opts: FeatureEffectsRunOptions = {},
): Promise<FeatureAnalysis> {
  guardQualityMinds(config);
  const input = buildFeatureEffectsInput(ctx);
  const { text, manifest } = await reason(config, [{ role: 'user', content: input }], opts);
  return { choices: manifest.choices, spellsToGround: manifest.spellsToGround, blocked: manifest.blocked, analysisText: text };
}

/**
 * Call 2 — Nach-Analyse + Grounding + Pass C ins Rider-Schema.
 *
 * Der Verlauf aus Call 1 wird FORTGESCHRIEBEN statt neu aufgebaut, weil erst die
 * Nach-Analyse auf demselben Verlauf choice-abhängige Zauber benennen kann. Ohne
 * getroffene Wahl entfällt sie und spart einen Reasoning-Call.
 */
export async function finalizeFeatureEffects(
  config: LlmConfig,
  ctx: FeatureEffectsContext,
  analysis: FeatureAnalysis,
  opts: FeatureEffectsRunOptions = {},
): Promise<FeatureEffects> {
  guardQualityMinds(config);
  const input = buildFeatureEffectsInput(ctx);

  // Beim Direkteinstieg in die Finalisierung fehlt die Analyse und wird nachgeholt —
  // der Wahl-Turn braucht die Choice-ids aus ihrem Manifest.
  let text = analysis.analysisText.trim();
  let manifest: EffectsManifest = {
    choices: analysis.choices,
    spellsToGround: analysis.spellsToGround,
    blocked: analysis.blocked,
  };
  if (!text) ({ text, manifest } = await reason(config, [{ role: 'user', content: input }], opts));

  const turns: ChatMessage[] = [
    { role: 'user', content: input },
    { role: 'assistant', content: text },
  ];

  if (ctx.resolvedChoices?.length) {
    const answerTurn = buildResolvedChoicesTurn(ctx.resolvedChoices);
    const after = await reason(config, [...turns, { role: 'user', content: answerTurn }], opts);
    turns.push({ role: 'user', content: answerTurn }, { role: 'assistant', content: after.text });
    manifest = after.manifest;
  }

  // Bei offener Wahl gibt es noch nichts zu erden.
  const spellResolution = manifest.blocked
    ? ''
    : await buildSpellResolution(manifest.spellsToGround, ctx.classContext.klasseName);

  const messages: ChatMessage[] = [
    { role: 'system', content: FEATURE_EFFECTS_SYSTEM },
    ...turns,
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

  let result = await runPassC();
  if (!result && !opts.noRetry) result = await runPassC();
  if (!result) throw new Error('Die KI lieferte keine schema-validen Merkmals-Effekte.');
  return result;
}
