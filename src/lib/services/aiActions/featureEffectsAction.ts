/**
 * Deutung neu gewonnener Merkmale/Talente: aus der Regelprosa die mechanischen Effekte
 * („Rider"), die erzwungenen Spielerwahlen und je Merkmal eine `sheetNote` fürs PDF.
 *
 * ZWEI Calls mit Checkpoint dazwischen, damit der User direkt nach der Analyse entscheidet:
 * `analyzeFeatureEffects` (Reasoning, bewusst ohne Rider-Vokabular) → der Flow zeigt die
 * Choices → `finalizeFeatureEffects` (Nach-Analyse im Verlauf + Grounding + Guided).
 * QM-only, Prompts englisch.
 *
 * EINSPRACHIG ENGLISCH, durchgehend: `buildFeatureEffectsInput` streicht `nameDe`/`descDe`
 * beim Serialisieren, obwohl `GainedFeature` sie trägt — eine Aufbereitung, zwei
 * Projektionen. Deutsch entsteht ausschließlich in den beiden thinking-off-Calls von
 * `featureTranslationAction`: T1 übersetzt die Wahlen für den Checkpoint, T2 die
 * Bogen-Notizen. Der Schnitt ist Absicht: **dieser Pass entscheidet, WAS gilt, der
 * Übersetzer, WIE es dasteht.** Reasoning in zwei Sprachen zugleich kostete hier Qualität
 * an beiden Enden — der Analyse-Prompt war halb Regel-Analytiker, halb deutscher Texter.
 *
 * Die Verdichtungs-Doktrin der `sheetNote` liegt in `fieldSummaryAction`
 * (`SHEET_NOTE_CONTENT` — die deutsche Form-Hälfte liest T2) — dieselbe Regel trägt die
 * Feld-Zusammenfassung im Charakter-Editor, und sie soll nur an einer Stelle optimiert werden.
 *
 * Ein Detail trägt die Qualität messbar (evals/featureAnalysis.eval.test.ts): die
 * getroffenen Wahlen kommen als eigener Folge-Turn statt im Erst-Prompt.
 */
import {
  CHOICE_HELP_EN_MAX_CHARS,
  featureEffectsJsonSchema,
  parseFeatureEffects,
  SHEET_NOTE_EN_MAX_CHARS,
  type FeatureEffects,
} from '../../schemas/levelUp';
import { SHEET_NOTE_CONTENT, SHEET_NOTE_EXAMPLE_EN } from './fieldSummaryAction';
import { translateChoices, translateSheetNotes, type TranslationSource } from './featureTranslationAction';
import { ARMOR_TRAININGS, SKILL_NAMES, WEAPON_CATEGORIES } from '../../schemas/shared';
import type { LlmConfig } from '../../types';
import type { ChatMessage } from '../llmService';
import { qualitymindsChat, qualitymindsGenerateStructuredFromMessages, TASK_TEMPERATURE } from '../llmService';
import { getSpellLibrary, resolveClass } from '../../spellLibrary';
import { resolveSpell } from '../levelUpMachine';
import type { PastChoice } from '../characterFeatures';
import { stripJsonFence } from '../jsonFence';

/**
 * Einheitliche Eingabe-Einheit für die Effekt-Deutung (Merkmal ODER Talent).
 *
 * Die deutschen Felder gehen NICHT an die Deutungs-Calls (siehe
 * `buildFeatureEffectsInput`) — sie sind die Quelle der beiden Übersetzungs-Calls.
 */
export interface GainedFeature {
  name: string; // Englischer Name — der Anker, den die Rider wörtlich zurückgeben
  nameDe?: string; // Deutscher Anzeigename (Übersetzer-Glossar)
  desc: string; // Original-Regeltext (EN) — maßgeblich für die Mechanik
  descDe?: string; // Übersetzung — Quelle der wörtlich zitierten deutschen Optionslabels
  source: 'class' | 'subclass' | 'feat' | 'species';
  gainedAt: number;
  key?: string; // Open5e-v2-Schlüssel des Merkmals (Provenienz im LevelUp-Dokument)
  choice?: string; // Bereits getroffene Entscheidung (EN) — verhindert, dass sie erneut gefragt wird
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
const FEATURE_EFFECTS_SYSTEM = `You are a rules assistant for Dungeons & Dragons 5e (SRD 5.2).
The conversation above contains the game features/feats a character has JUST gained (<gained_features>, each with its English rules text "desc" and — where the character's origin already fixed a specialisation — "choice") plus class context, your analysis of them, the player's answers to the forced choices (<resolved_choices>) and the re-done analysis that takes those answers into account. Resolved spell lookups follow below.
Turn all of that into the concrete, app-modellable mechanical effects each feature grants — a list of typed "riders" — plus one terse sheet note per feature. Every forced choice is ALREADY MADE; never emit unmade choices or option lists.
Write ENGLISH throughout. The app translates your sheet notes afterwards; German wording here would be thrown away.

## Rules
1. Emit EXACTLY ONE rider per entry in <gained_features>, in the same order, with featureName and featureKey copied verbatim. A feature without any mechanical grant still gets its rider — leave the grant fields at their empty defaults and only fill sheetNote (see rule 10). Never invent a rider for a feature that is not in <gained_features>.
2. grantedSpells: spells a feature makes ALWAYS PREPARED / grants for free (subclass/circle/domain lists, spell-granting feats), already reflecting the resolved choice. Canonical ENGLISH SRD names. NEVER spells the player merely MAY learn. A cantrip the feature makes you KNOW BY NAME ("You know the Minor Illusion cantrip") is such a grant and belongs here too — the sheet can only record it if you name it.
3. extraCantrips / extraPreparedCount: how many ADDITIONAL cantrips the player may freely PICK resp. how many more spells they may prepare than the class table allows. A cantrip you named in grantedSpells is not a free pick — do not count it here as well, or the character gets it twice.
4. expertiseSkills: the CHOSEN skills that gain Expertise (double proficiency), taken from <resolved_choices>. Never a list of options. Use the canonical English skill names listed in rule 5.
5. proficiencies: what the feature grants, in CLOSED vocabularies — anything outside them cannot be recorded on the character sheet:
   - skills: exactly one of ${SKILL_NAMES.join(', ')}.
   - weapons: ${WEAPON_CATEGORIES.join(' or ')} (a restricted grant such as "Martial weapons with the Light property" is NOT a category — leave weapons empty and describe it in sheetNote).
   - armor: ${ARMOR_TRAININGS.join(', ')}.
   - savingThrows: the full English ability name (Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma) — and ONLY for a real proficiency in that save. "Advantage on Intelligence, Wisdom, and Charisma saving throws" is not one: it belongs in the sheetNote, and entered here it would add a proficiency bonus the rules never grant.
   - tools / languages: free text, English.
6. abilityScoreIncrease: ability increases the feature dictates — FIXED ones (e.g. a feat giving +1 CON) AND any resolved "+1 to one of…" choice from <resolved_choices>. NEVER the generic ASI (handled separately). German keys (the sheet's, not a language choice): str, ges (dex), kon, int, wei (wis), cha.
7. decisions: EXACTLY ONE per entry in <resolved_choices> that this feature triggered — copy its "id" verbatim and leave "question" and "answer" EMPTY (the app fills both from its own records). Nothing else EVER becomes a decision: a choice that is not in that list has not been answered yet — a spell pick the player only makes in a later step, for instance — and an unanswered decision reaches the character sheet with an empty answer. No <resolved_choices> in the conversation → "decisions": []. Bake the choice's mechanical consequence into the grant fields above; the decision itself is only the audit record of what the player picked (e.g. which Primal Order a druid took).
8. Do NOT restate deterministic numbers (spell slots, proficiency bonus, hit die) — applied automatically. Only add value the raw table cannot express.
9. Never invent mechanics that are not in the feature's own rules text. When in doubt, leave a field empty.

## sheetNote (rule 10)
10. sheetNote is that entry for THIS feature, squeezed into ONE line for the sheet's "class features" field: no line breaks, no markdown, HARD LIMIT ${SHEET_NOTE_EN_MAX_CHARS} characters — that is about 20 words, so decide per clause whether it still fits. The line is translated into German afterwards and merged with the player's own free text, so there is no room beyond it: over budget you drop words (articles, "you can", spelled-out numbers), never the mechanic. Start it with the feature's English name, then ": ". Empty string ("") where the doctrine below wants no entry. Here, "an option the player picked" means an entry in <resolved_choices>; that choice is also stored structurally (it comes back as <past_choices> on later level-ups), so it only earns a note when it adds an ongoing mechanic.

${SHEET_NOTE_CONTENT}

${SHEET_NOTE_EXAMPLE_EN}`;

/**
 * Pass-A-Prompt (Reasoning): reine Analyse, bewusst OHNE Rider-Vokabular. Strukturiert
 * werden nur die deterministisch weiterverarbeiteten Dinge — Spielerwahlen und zu erdende
 * Zauber; alles Übrige bleibt Prosa für Pass C.
 */
export const FEATURE_EFFECTS_ANALYSIS_SYSTEM = `You are a rules analyst for Dungeons & Dragons 5e (SRD 5.2).
You receive the game features/feats a character has JUST gained (<gained_features>) plus class context (<class_context>). Each feature carries its rules text in "desc".
A feature may additionally carry "choice": a specialisation the character's ORIGIN already fixed (the Sage background grants Magic Initiate with its spell list named: "Wizard"). Treat it as FINAL — never turn it into a question, and let it drive whatever it decides (a spell-pick's spellClass, for instance).
Your ONLY job is to ANALYSE these features so a later deterministic step and a separate formatting step can turn your analysis into concrete mechanics. Do NOT build the app's result structures here — reason in prose and end with one compact manifest.
Write ENGLISH throughout — questions, options, help texts, everything. A separate step translates the choices for the player's German UI; German wording here would be thrown away.

## What to work out
1. Forced player choices: EVERY choice a feature forces on the player NOW — a subclass option, an Expertise skill selection, "+1 to one of several abilities", pick a spell from a list, etc. For each, note the question, the concrete options if you know them, how many may be picked (max), and whether the choice DETERMINES further mechanical effects that cannot be stated until it is made (e.g. a Draconic Ancestry decides the damage type of its Breath Weapon). Four rules on top:
   - **ONLY what has to be decided now.** The player is standing at a level-up or at character creation, and answers once. A choice the rules re-open at a repeating moment — "whenever you finish a Long Rest, choose …", "as a Bonus Action, choose one of the following", "each time you use this feature, choose …" — is made at the table, not here: do NOT put it in the manifest, never let it block, and state the grants of ALL its branches as unconditional (a druid who picks the land type anew after every Long Rest simply has the circle spells of every land).
   - **featureKey**: copy the "key" of the emitting feature VERBATIM from <gained_features>. Never invent, shorten or translate it. Empty string only if that feature carries no key.
   - **Option wording**: give each option EXACTLY as the feature's own rules text writes it (for a bolded option paragraph \`**Warden.**\` the option is \`Warden\`). It is the key the app matches the stored answer against, so do not paraphrase, expand or re-case it.
   - **isBuildDecision**: true only for a PERMANENT character-building choice (Primal Order, Divine Order, Expertise skills, an elven lineage, metamagic options). false for a choice that is forced now but re-made on each USE of the feature — it gets answered, not recorded. Options a feature offers only in the moment of use (Channel Divinity's Divine Spark vs Turn Undead, Cunning Strike effects, Brutal Strike effects) are not forced now and, by the rule above, do not belong in the manifest at all.
   - **Choosing SPELLS is its own type.** If the choice is "pick N spells/cantrips from the X spell list" (Magic Initiate, Magical Discoveries, Mystic Arcanum), set type="spell-pick", fill spellLevels (0 = cantrip) and spellClass with the ENGLISH class key of that list ("cleric", "druid", "wizard", "bard", "sorcerer", "warlock", "ranger", "paladin"), and leave options EMPTY. Some sources name the list by tradition — map "Arcane"→wizard, "Divine"→cleric, "Primal"→druid. The player picks from the local spell library, so any spell name you wrote here could only be an invention. Emit ONE spell-pick per level band: cantrips and level 1+ spells are separate choices — and set each one's "max" to HOW MANY spells of that band the feature lets the player pick ("two cantrips of your choice" plus "a level 1 spell" → max 2 and max 1). The app opens exactly "max" slots, so a max of 1 for two cantrips silently costs the character one.
2. Mechanical dependencies: state clearly which grants depend on which choice and which grants are unconditional.
3. Spells the feature hands the character for free — both those it makes ALWAYS PREPARED (subclass/circle/domain lists, spell-granting feats) and a cantrip it makes you KNOW BY NAME ("You know the Minor Illusion cantrip") — canonical ENGLISH SRD names. A named cantrip that is missing here cannot be recorded later: the effects pass is bound to this list. List a spell ONLY once no still-open choice blocks it. Never list spells the player merely MAY learn, and never a spell the player PICKS: a spell-pick choice covers those, even when the picked spell ends up always prepared.
4. Any other concrete mechanical grants (proficiencies, fixed ability increases, extra cantrips/prepared spells) — describe them in prose. You do NOT need to structure these; the next step reads your prose.

## <past_choices>
May be present: build decisions this character made at EARLIER levels, as {"featureKey", "feature", "choice"}. They are FINAL — never ask about them again, and treat their consequences as already in place (a druid who chose Warden has Martial weapon proficiency and Medium armor training). Use them when a new feature builds on an older choice. A choice recorded before this app spoke English here may still be German — read it as the option it names.

## <resolved_choices>
The player answers in a LATER turn, as a compact list of {"id": "<the id from your manifest>", "choice": "<the option label the player picked>"} — nothing else. When that turn arrives, REDO the analysis with those answers baked in:
- Each listed choice is FINAL: it no longer blocks anything, so the spells/effects it unlocks can now be stated (canonical English spell names).
- Keep every choice in the manifest under its ORIGINAL id, but set its determinesFurtherEffects=false.
- Emit the full prose + manifest again; set blocked=false once nothing is open any more.

## Output
Reason in prose first. Then end your answer with EXACTLY ONE fenced JSON manifest and nothing after it:
\`\`\`json
{
  "choices": [
    { "id": "choice_<featureslug>_1", "feature": "<feature name>", "featureKey": "<key verbatim from <gained_features>>", "question": "<question>", "type": "choice", "options": ["<option>"], "spellLevels": [], "spellClass": "", "help": "<short summary of the options' consequences>", "optionHelp": { "<option>": "<its concrete consequence>" }, "max": 1, "determinesFurtherEffects": true, "isBuildDecision": true }
  ],
  "spellsToGround": ["Canonical English Spell Name"],
  "blocked": false
}
\`\`\`
- choices: EVERY forced player choice (incl. expertise). Stable ids. type = "choice" (pick one), "multiselect" (pick max), "text" (free) or "spell-pick" (pick spells from a class list). options=[] if free text or spell-pick. max = how many may be picked (1 for single). determinesFurtherEffects=true only when the answer unlocks grants you cannot state yet — always false for spell-pick, because the picked spells ARE the effect. featureKey and isBuildDecision as specified above.
  - spellLevels / spellClass: ONLY for type="spell-pick" (see above), otherwise [] and "".
  - help: a SHORT one-liner (≤${CHOICE_HELP_EN_MAX_CHARS} chars — it gets translated into German, which runs longer) summarising the MECHANICAL consequences of the options, so the player understands the trade-off (e.g. "Warden → Martial weapons + Medium armor; Magician → one extra cantrip known" or "sets the damage type of Breath Weapon and the resistance"). Empty string if the options carry no notable consequence.
  - optionHelp: an object mapping EACH option label (verbatim, same string as in "options") to its own concrete consequence (≤60 chars each), whenever the options differ mechanically — e.g. for Draconic Ancestry {"Black": "acid damage", "Blue": "lightning damage", "Red": "fire damage"}. Use {} when the options carry no per-option consequence (e.g. picking Expertise skills).
- spellsToGround: canonical ENGLISH names of always-prepared spell grants to resolve NOW (empty [] if none or if blocked).
- blocked: true if a determinesFurtherEffects choice is still open (not yet in <resolved_choices>) and therefore blocks stating spell grants.`;

/**
 * Bewusst OHNE Charakter-Zusammenfassung: gedeutet wird nur Merkmals-Prosa + Klassen-
 * Kontext. Attribute/Slots/HP wären hier Token-Ballast und Ablenkung.
 *
 * Projiziert auf ENGLISCH: `nameDe`/`descDe` bleiben draußen, obwohl `GainedFeature` sie
 * trägt. Sie sind die Quelle der Übersetzungs-Calls, nicht Kontext fürs Reasoning — und der
 * Block wird dreimal wiederholt (Analyse, Nach-Analyse, Pass C).
 */
export function buildFeatureEffectsInput(ctx: {
  classContext: FeatureClassContext;
  features: GainedFeature[];
  pastChoices?: PastChoice[];
}): string {
  const english = ctx.features.map((f) => ({
    name: f.name,
    desc: f.desc,
    source: f.source,
    gainedAt: f.gainedAt,
    ...(f.key ? { key: f.key } : {}),
    ...(f.choice ? { choice: f.choice } : {}),
  }));
  return [
    `<class_context>${JSON.stringify(ctx.classContext)}</class_context>`,
    `<gained_features>${JSON.stringify(english)}</gained_features>`,
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

/**
 * Eine erkannte, erzwungene Spielerwahl — treibt den Checkpoint.
 *
 * ZWEISPRACHIG, mit klarer Rollenteilung: die englischen Felder sind die kanonischen (sie
 * gehen an die KI zurück und werden am Charakter gespeichert), die `…De`-Felder sind die
 * Anzeige. Letztere kommen vom Übersetzungs-Call und sind leer, wenn er nicht lief oder
 * scheiterte — dann zeigt die Oberfläche Englisch, statt den Checkpoint zu verlieren.
 */
export interface AnalysisChoice {
  id: string;
  feature: string;
  /** Deutscher Anzeigename des Merkmals — kommt aus der Bibliothek, nie vom Modell. */
  featureDe: string;
  /** Bibliotheks-Key des Merkmals — Anker, unter dem die Antwort am Charakter landet. */
  featureKey: string;
  question: string;
  /**
   * `spell-pick` = die Wahl ist eine ZAUBER-Wahl („Magiekundiger": 2 Zaubertricks aus der
   * Klerikerliste). Dann trägt `options` bewusst NICHTS: die Namen kommen aus `vault/spells`,
   * gefiltert über `spellLevels` + `spellClass`. Sonst wären es erfundene Zauber.
   */
  type: 'choice' | 'multiselect' | 'text' | 'spell-pick';
  options: string[];
  /** Nur bei `spell-pick`: erlaubte Zaubergrade (0 = Zaubertrick). */
  spellLevels: number[];
  /** Nur bei `spell-pick`: englischer Klassen-Key der Zauberliste („cleric", „druid", „wizard"). */
  spellClass: string;
  /** Knappe Zusammenfassung der Konsequenzen (Tooltip); leer, wenn keine. */
  help: string;
  /** Je Option (Schlüssel = Options-Label) ihre konkrete Konsequenz, z.B. „Black"→„acid damage". */
  optionHelp: Record<string, string>;
  max: number;
  determinesFurtherEffects: boolean;
  /** false = Wahl pro Einsatz (Kanalisierte Göttlichkeit u.ä.) → wird nicht protokolliert. */
  isBuildDecision: boolean;
  // ── Anzeige-Fassung (Übersetzungs-Call; leer = Englisch anzeigen) ──
  questionDe: string;
  helpDe: string;
  /** Parallel zu `options`: gleiche Länge und Reihenfolge, sonst leer. */
  optionsDe: string[];
  /** Geschlüsselt mit dem ENGLISCHEN Options-Label — dem stabilen Wert der Auswahl. */
  optionHelpDe: Record<string, string>;
}

/** Anzeige-Label einer Option: Übersetzung, wenn vorhanden, sonst der englische Wert. */
export function optionLabel(choice: AnalysisChoice, index: number): string {
  return choice.optionsDe[index]?.trim() || choice.options[index] || '';
}

/**
 * Die getroffene Antwort (englische Werte, bei Mehrfachauswahl komma-verbunden) als deutsche
 * Anzeige. Was in den Optionen nicht vorkommt, bleibt stehen — Freitext und Zaubernamen
 * haben kein Optionspaar und sind schon die Anzeige.
 */
export function choiceLabelsDe(choice: AnalysisChoice, valueCsv: string): string {
  return valueCsv
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => {
      const i = choice.options.indexOf(v);
      return i >= 0 ? optionLabel(choice, i) : v;
    })
    .join(', ');
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
  const spellLevels = Array.isArray(o.spellLevels)
    ? [...new Set(o.spellLevels.filter((x): x is number => typeof x === 'number' && x >= 0 && x <= 9).map(Math.floor))]
    : [];
  const spellClass = typeof o.spellClass === 'string' ? (resolveClass(o.spellClass) ?? '') : '';
  // Eine Zauber-Wahl OHNE Grad-Filter wäre ein Picker über die ganze Bibliothek — dann ist
  // eine gewöhnliche Wahl das kleinere Übel. Die Klassenliste darf fehlen (dann ungefiltert
  // nach Klasse, aber immer noch nach Grad), der Grad nicht.
  const type =
    o.type === 'spell-pick' && spellLevels.length
      ? 'spell-pick'
      : o.type === 'multiselect' || o.type === 'text'
        ? o.type
        : 'choice';
  return {
    id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : slug,
    feature: typeof o.feature === 'string' ? o.feature : '',
    featureDe: '', // deterministisch nachgetragen (siehe `withGermanChoices`)
    featureKey: typeof o.featureKey === 'string' ? o.featureKey.trim() : '',
    question: o.question,
    type,
    options: Array.isArray(o.options) ? o.options.filter((x): x is string => typeof x === 'string') : [],
    spellLevels: type === 'spell-pick' ? spellLevels : [],
    spellClass: type === 'spell-pick' ? spellClass : '',
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
    // Eine Zauber-Wahl kann nichts weiter freischalten — die gewählten Zauber SIND der
    // Effekt. Sonst würde der Flow unnötig einen zweiten Analyse-Durchlauf anhängen.
    determinesFurtherEffects: type !== 'spell-pick' && o.determinesFurtherEffects === true,
    // Vorsichtiger Default: eine nicht als Aufbau-Wahl markierte Antwort wird nur
    // protokolliert, wenn das Modell es ausdrücklich sagt — sonst wächst das Ledger
    // mit Taktik-Optionen zu.
    isBuildDecision: o.isBuildDecision === true,
    // Bleiben leer, bis der Übersetzungs-Call sie füllt.
    questionDe: '',
    helpDe: '',
    optionsDe: [],
    optionHelpDe: {},
  };
}

/** Die Merkmale als Quelle für die Übersetzer (deutsche Felder inklusive). */
function translationSources(features: GainedFeature[]): TranslationSource[] {
  return features.map((f) => ({ name: f.name, nameDe: f.nameDe, desc: f.desc, descDe: f.descDe, key: f.key }));
}

/**
 * T1 anhängen: die deutschen Anzeige-Texte der Wahlen. Ein Fehlschlag ist hier kein
 * Fehler, sondern ein unübersetzter Checkpoint (siehe `featureTranslationAction`).
 */
async function withGermanChoices(
  config: LlmConfig,
  raw: AnalysisChoice[],
  features: GainedFeature[],
  opts: FeatureEffectsRunOptions,
): Promise<AnalysisChoice[]> {
  // Zauber-Wahlen tragen keine Optionslabels; ihre Frage bleibt dennoch anzeigepflichtig.
  if (!raw.length) return raw;

  // Der Merkmalsname ist keine Übersetzungsaufgabe: er steht deutsch in der Bibliothek.
  const nameDeByKey = new Map(features.filter((f) => f.key).map((f) => [f.key!, f.nameDe || f.name]));
  const choices = raw.map((c) => ({ ...c, featureDe: nameDeByKey.get(c.featureKey) || c.feature }));
  const translations = await translateChoices(
    config,
    {
      choices: choices.map((c) => ({
        id: c.id,
        featureKey: c.featureKey,
        question: c.question,
        help: c.help,
        options: c.options,
        optionHelp: c.optionHelp,
      })),
      features: translationSources(features),
    },
    { signal: opts.signal },
  );
  return choices.map((c) => {
    const t = translations.get(c.id);
    return t ? { ...c, questionDe: t.questionDe, helpDe: t.helpDe, optionsDe: t.optionsDe, optionHelpDe: t.optionHelpDe } : c;
  });
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
    'Now emit the result in exactly the required schema — one rider per feature in ' +
      '<gained_features>, in the same order, with featureName and featureKey copied verbatim. ' +
      'For every choice listed in <resolved_choices>, add one entry to the matching rider\'s ' +
      'decisions[] with its id copied verbatim and question/answer left EMPTY, and let its ' +
      'outcome flow into the concrete grants (grantedSpells / expertiseSkills / ' +
      'abilityScoreIncrease). Anything NOT listed there gets no decision — leave decisions[] ' +
      'empty for those riders.\n' +
      'Set sheetNote only where the character sheet genuinely needs the information (rule 10); ' +
      'leave it empty otherwise. Keep it short and ENGLISH — it gets translated, and space on ' +
      'the sheet is tight.',
  ];
  if (spellResolution) {
    parts.push(
      'For grantedSpells use only the canonical English names from <spell_resolution>; ' +
        'reconsider names marked as NOT FOUND instead of forcing them.\n' +
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
  // Leere Antwort heißt bei einem Reasoning-Modell fast immer: das Token-Budget ging
  // vollständig ins Denken, für die Antwort blieb nichts. Ohne diesen Wurf sähe der Flow
  // ein leeres Manifest und meldete „keine erzwungenen Wahlen" — die Wahl fiele still aus.
  if (!text.trim())
    throw new Error(
      'Die Merkmals-Analyse kam leer zurück — das Token-Budget des Modells reicht für den ' +
        'Reasoning-Vorlauf nicht aus. Bitte „Max. Tokens" in den LLM-Einstellungen erhöhen ' +
        '(Richtwert: mindestens 8192).',
    );
  return { text, manifest: parseManifest(text) };
}

/**
 * Call 1 — der Flow zeigt den Entscheidungs-Checkpoint direkt danach; die Übersetzung der
 * Wahlen hängt deshalb hier dran und nicht erst im Flow: sonst müsste jeder Aufrufer sie
 * selbst anstoßen und der Checkpoint könnte unübersetzt aufgehen.
 */
export async function analyzeFeatureEffects(
  config: LlmConfig,
  ctx: FeatureEffectsContext,
  opts: FeatureEffectsRunOptions = {},
): Promise<FeatureAnalysis> {
  guardQualityMinds(config);
  const input = buildFeatureEffectsInput(ctx);
  const { text, manifest } = await reason(config, [{ role: 'user', content: input }], opts);
  const choices = await withGermanChoices(config, manifest.choices, ctx.features, opts);
  return { choices, spellsToGround: manifest.spellsToGround, blocked: manifest.blocked, analysisText: text };
}

/**
 * Call 2 — Nach-Analyse + Grounding + Pass C ins Rider-Schema, dann die deutsche Grenze
 * (Wahl-Protokolle deterministisch, Bogen-Notizen per Übersetzungs-Call).
 *
 * Der Verlauf aus Call 1 wird FORTGESCHRIEBEN statt neu aufgebaut, weil erst die
 * Nach-Analyse auf demselben Verlauf choice-abhängige Zauber benennen kann. Ohne
 * getroffene Wahl entfällt sie und spart einen Reasoning-Call.
 *
 * Die Übersetzung sitzt bewusst HIER und nicht beim Aufrufer: beide Flows und die
 * Eval-Strecke sehen damit denselben fertigen, deutschen Rider.
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

  // Beim Direkteinstieg trägt nur das nachgeholte Manifest die Wahlen (dann ohne Übersetzung).
  const choiceList = analysis.choices.length ? analysis.choices : manifest.choices;
  const withDecisions = fillDecisions(result, choiceList, ctx.resolvedChoices ?? []);
  return germanizeSheetNotes(config, withDecisions, ctx.features, choiceList, opts);
}

/**
 * Frage und Antwort der protokollierten Wahlen deterministisch nachtragen — beide stehen
 * schon auf Deutsch in der Analyse bzw. in der Antwort des Spielers. Das Modell danach zu
 * fragen hieße, dieselbe Zeichenkette ein zweites Mal erzeugen zu lassen; genau dabei drifteten
 * Frage und Label früher auseinander.
 */
function fillDecisions(effects: FeatureEffects, choices: AnalysisChoice[], resolved: ResolvedChoice[]): FeatureEffects {
  if (!resolved.length) return effects;
  const byId = new Map(choices.map((c) => [c.id, c]));
  const answerById = new Map(resolved.map((r) => [r.id, r.choice]));
  return {
    ...effects,
    riders: effects.riders.map((rider) => ({
      ...rider,
      decisions: rider.decisions.map((d) => {
        const choice = byId.get(d.id);
        const answerEn = answerById.get(d.id) ?? d.answer;
        return {
          id: d.id,
          question: choice?.questionDe.trim() || choice?.question || d.question,
          // Die Antwort kommt als englischer Wert zurück; angezeigt wird das Options-Label.
          answer: choice ? choiceLabelsDe(choice, answerEn) : answerEn,
        };
      }),
    })),
  };
}

/** T2 anhängen: deutsche Bogen-Notizen. Bei Fehlschlag bleibt die englische Zeile stehen. */
async function germanizeSheetNotes(
  config: LlmConfig,
  effects: FeatureEffects,
  features: GainedFeature[],
  choices: AnalysisChoice[],
  opts: FeatureEffectsRunOptions,
): Promise<FeatureEffects> {
  const notes = effects.riders
    .map((r, index) => ({ index, featureKey: r.featureKey, featureName: r.featureName, note: r.sheetNote.trim() }))
    .filter((n) => n.note);
  if (!notes.length) return effects;

  // Die Options-Paare der Wahlen als feste Begriffe: eine Notiz nennt die getroffene Wahl
  // („Magic Initiate (Wizard)"), und ohne dieses Paar wird daraus „Zauberer" statt „Magier".
  const terms = choices.flatMap((c) =>
    c.options.map((en, i) => ({ en, de: optionLabel(c, i) })).filter((t) => t.de && t.de !== t.en),
  );
  const translated = await translateSheetNotes(
    config,
    { notes, features: translationSources(features), terms },
    { signal: opts.signal },
  );
  if (!translated.size) return effects;
  return {
    ...effects,
    riders: effects.riders.map((rider, index) => {
      const de = translated.get(index);
      return de ? { ...rider, sheetNote: de } : rider;
    }),
  };
}
