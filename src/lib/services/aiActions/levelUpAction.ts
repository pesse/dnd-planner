/**
 * KI-Aktionen für den Stufenaufstieg — zwei tool-freie `AiAction`s.
 *
 * Aufruf #1 (`buildLevelUpQuestionsAction`): aus dem deterministischen Delta einen
 * getippten Fragebogen erzeugen (nur echte Wahlentscheidungen).
 * Aufruf #2 (`buildLevelUpProposalAction`): aus Delta + Antworten den ADDITIVEN
 * Änderungsvorschlag bauen.
 *
 * Beide haben leere Tool-Arrays → `runAiAction` nimmt den tool-freien Pfad
 * (Anthropic: generateStructured; sonst generate+extractJson) und funktioniert
 * damit auch ohne Structured-Output-Provider (Groq/QM/Ollama).
 *
 * Prompts sind ENGLISCH; nur nutzer-sichtbare Feldinhalte sind Deutsch.
 */
import type { AiAction } from './types';
import type { LevelUpDelta, SubclassOption } from '../levelUp';
import type { FeatureRider } from '../../schemas/levelUp';
import type { GainedFeature } from './featureEffectsAction';
import {
  levelUpQuestionnaireJsonSchema,
  levelUpProposalJsonSchema,
  levelUpNarrativeJsonSchema,
  classFeaturesRewriteJsonSchema,
  parseLevelUpQuestionnaire,
  parseLevelUpProposal,
  parseLevelUpNarrative,
  parseClassFeaturesRewrite,
  type LevelUpQuestionnaire,
  type LevelUpProposal,
  type LevelUpNarrative,
  type ClassFeaturesRewrite,
} from '../../schemas/levelUp';

/** Kompakte, token-schonende Charakter-Sicht für die Prompts. */
export interface CharacterSummary {
  name: string;
  classes: { name: string; level: number; subclassName: string }[];
  totalLevel: number;
  abilities: Record<string, number>;
  mods: Record<string, number>;
  hitDice: string;
  spellcasting: { class: string; ability: string; currentSlots: number[] };
}

const QUESTIONS_SYSTEM = `You are a rules assistant for Dungeons & Dragons 5e (SRD 5.2 / German 5.2.1 terminology).
A player character is advancing one class from <level_up_delta>.fromLevel to <level_up_delta>.toLevel
(usually +1, but may be several levels — <level_up_delta>.levelsGained). If <level_up_delta>.isNewClass is
true, the player is STARTING a new class via multiclassing (it begins at level 1): do NOT ask for a subclass
(that is chosen at a later class level), and remember multiclassing grants only limited proficiencies (no new
saving-throw proficiencies). All deterministic game data (new spell slots, proficiency bonus, hit die, features
gained across the span) has ALREADY been computed and is given to you in <level_up_delta>. Your ONLY task is to
produce the list of DECISIONS the player must actively make, as a typed questionnaire.

## Rules
1. Emit a question ONLY where the player genuinely chooses. Typical cases:
   - Subclass selection: ONLY if <subclass_options> is non-empty (means none chosen yet). type "choice", options = <subclass_options> (value=key, label=name).
   - Hit points: type "choice" id "hp_method", options "roll"/"average" (label in German), defaultValue "average". If levelsGained is 1 you MAY add a type "number" question id "hp_roll" (min 1, max = <level_up_delta>.hitDie) for the rolled value; for multiple levels prefer "average" and skip per-level rolls.
   - Ability Score Improvement vs. Feat: emit ONE such decision PER ASI level gained — <level_up_delta>.asiCount decisions (ids "asi_or_feat_1", "asi_or_feat_2", …). type "choice" ("Attributswerte erhöhen" / "Talent wählen"); for each, add a matching type "text" ("asi_dist_1", …) asking which ability scores to raise (+2 to one, or +1/+1) resp. which feat. If asiCount is 0, emit none.
   - New cantrips/spells: ONLY if <level_up_delta>.cantripDelta > 0 or the class learns spells in this span. type "text" or "multiselect".
   - Any class-specific choice implied by the features in <level_up_delta>.featuresGained (e.g. Fighting Style, Expertise, Metamagic). Use "choice"/"multiselect" if you know the options, else "text".
2. NEVER ask about anything already deterministic (spell slots, proficiency bonus, hit die value) — those are applied automatically.
3. If nothing needs a decision, return an empty "questions" array.
4. Pre-fill "defaultValue" and "options" wherever derivable.
5. Every "prompt", "help" and option "label" MUST be written in GERMAN. Keep prompts short.`;

const PROPOSAL_SYSTEM = `You are a rules assistant for Dungeons & Dragons 5e (SRD 5.2 / German 5.2.1 terminology).
Assemble the level-up changes as ADDITIVE deltas in JSON.

## Rules
1. Every numeric field is a DELTA to ADD to the character's current value — NEVER an absolute total.
   This preserves bonuses from magic items or manual edits.
2. spellSlotDeltas: copy <level_up_delta>.spellSlotDelta verbatim (already computed; 9 numbers, index 0 = spell level 1). Do NOT recompute.
3. Cantrips: if <level_up_delta>.cantripDelta > 0, list that many new cantrip names in newCantrips based on <answers>; otherwise [].
4. Apply <answers>:
   - Hit points: per level gained, the increase is (rolled number if hp_method="roll", else class average = floor(hitDie/2)+1) PLUS the Constitution modifier (<character_summary>.mods.kon). Multiply by <level_up_delta>.levelsGained and put the TOTAL in hpGain.
   - Ability Score Improvement: sum ALL ASI decisions (asi_or_feat_1..N) into abilityScoreDeltas (keys str/ges/kon/int/wei/cha, German mapping dex=ges/wis=wei). Any decision that chose a feat contributes 0 to the scores — describe those feats in classFeaturesAppend + one referencesClassAdd entry each.
   - Subclass: if one was chosen, set "subclass" {key,name} from <subclass_options>.
5. classFeaturesAppend: a short GERMAN narrative naming the features gained this level (from <level_up_delta>.featuresGained and subclassFeaturesGained), suitable to append to the character's class-features text.
6. referencesClassAdd: one entry per gained feature — { sourceKey (from <level_up_delta>.sourceKey; use the subclass source for subclass features if known, else same), name (English feature name), gainedAt (<level_up_delta>.toLevel), desc (short GERMAN note) }.
7. hitDiceNew: the character's new full hit-dice string. Current is <character_summary>.hitDice (e.g. "5W10"); return the incremented version (e.g. "6W10"), German dice notation with "W". Empty if unknown.
8. Leave arrays empty and numbers 0 where nothing is gained. All human-readable text in GERMAN.`;

export function buildLevelUpQuestionsAction(): AiAction<LevelUpQuestionnaire> {
  return {
    id: 'levelup-questions',
    label: 'Stufenaufstieg: Fragen',
    anthropicTools: [],
    openAiTools: [],
    execute: async () => '',
    jsonSchema: levelUpQuestionnaireJsonSchema,
    validate: (d): d is LevelUpQuestionnaire => parseLevelUpQuestionnaire(d) !== null,
    buildSystemPrompt: () => QUESTIONS_SYSTEM,
  };
}

export function buildLevelUpProposalAction(): AiAction<LevelUpProposal> {
  return {
    id: 'levelup-proposal',
    label: 'Stufenaufstieg: Vorschlag',
    anthropicTools: [],
    openAiTools: [],
    execute: async () => '',
    jsonSchema: levelUpProposalJsonSchema,
    validate: (d): d is LevelUpProposal => parseLevelUpProposal(d) !== null,
    buildSystemPrompt: () => PROPOSAL_SYSTEM,
  };
}

// ── Dünner Narrativ-Pass (Standard-/deterministischer Pfad) ─────────────────────
// Alle Deltas werden deterministisch in levelUpFlow.assembleProposal gebaut; die KI
// liefert NUR das deutsche Narrativ (Zusammenfassung + Merkmals-Text zum Anhängen).
const NARRATIVE_SYSTEM = `You are a rules assistant for Dungeons & Dragons 5e (SRD 5.2 / German 5.2.1 terminology).
Write a short GERMAN narrative for a character's level-up. You are given the class span, the features/feats gained
and the mechanical riders (granted spells etc.) — all numbers are already applied deterministically, so do NOT
recompute or list slot/HP numbers.

## Output
- "summary": ONE short German paragraph summarizing what the character gains this level (features, subclass, feats, notable spells).
- "classFeaturesAppend": a concise GERMAN text naming the gained class/subclass features (one per line or comma-separated), suitable to append to the character's class-features field. Empty if nothing narrative was gained.
All text MUST be GERMAN. Be concise and accurate; do not invent features not present in the input.`;

export function buildLevelUpNarrativeAction(): AiAction<LevelUpNarrative> {
  return {
    id: 'levelup-narrative',
    label: 'Stufenaufstieg: Narrativ',
    anthropicTools: [],
    openAiTools: [],
    execute: async () => '',
    jsonSchema: levelUpNarrativeJsonSchema,
    validate: (d): d is LevelUpNarrative => parseLevelUpNarrative(d) !== null,
    buildSystemPrompt: () => NARRATIVE_SYSTEM,
  };
}

// ── Klassenmerkmale-Überarbeitung (eigener KI-Schritt) ──────────────────────────
const CLASS_FEATURES_SYSTEM = `You are a rules assistant for Dungeons & Dragons 5e (SRD 5.2 / German 5.2.1 terminology).
You revise a character's GERMAN free-text field "Klassenmerkmale & Eigenschaften" (class features & traits).
You are given the CURRENT field text (<current_text>) and the features/subclass/feats the character gained THIS
level-up (<gained_features>, <chosen_subclass>, <chosen_feats>).

## Task
Return the FULL revised field text that integrates the newly gained features coherently into the existing prose.

## Rules
1. KEEP all existing information — never drop anything the player already wrote. Reorganize only for clarity.
2. Integrate the new features in the SAME style/structure as the existing text (e.g. keep bullet lists, headings,
   or short lines if that is how the field is written). Avoid duplicating a feature that is already mentioned.
3. If helpful, group by class / subclass, but do not over-format; match the existing tone.
4. Add a short, accurate GERMAN description for each newly gained feature (from the input) — do NOT invent
   mechanics, numbers or features that are not in the input.
5. Output GERMAN only, in the single field "text". No commentary.`;

export function buildClassFeaturesRewriteAction(): AiAction<ClassFeaturesRewrite> {
  return {
    id: 'levelup-classfeatures',
    label: 'Stufenaufstieg: Klassenmerkmale überarbeiten',
    anthropicTools: [],
    openAiTools: [],
    execute: async () => '',
    jsonSchema: classFeaturesRewriteJsonSchema,
    validate: (d): d is ClassFeaturesRewrite => parseClassFeaturesRewrite(d) !== null,
    buildSystemPrompt: () => CLASS_FEATURES_SYSTEM,
  };
}

/** userInput für die Klassenmerkmale-Überarbeitung. */
export function buildClassFeaturesInput(ctx: {
  currentText: string;
  gainedFeatures: GainedFeature[];
  chosenSubclass: { key: string; name: string } | null;
  chosenFeats: { key: string; name: string; desc?: string }[];
}): string {
  return [
    `<current_text>${ctx.currentText}</current_text>`,
    `<gained_features>${JSON.stringify(ctx.gainedFeatures.map((f) => ({ name: f.name, source: f.source, desc: f.desc })))}</gained_features>`,
    `<chosen_subclass>${JSON.stringify(ctx.chosenSubclass)}</chosen_subclass>`,
    `<chosen_feats>${JSON.stringify(ctx.chosenFeats.map((f) => ({ name: f.name, desc: f.desc ?? '' })))}</chosen_feats>`,
  ].join('\n');
}

/** userInput für den Narrativ-Pass. */
export function buildNarrativeInput(ctx: {
  summary: CharacterSummary;
  delta: LevelUpDelta;
  gainedFeatures: GainedFeature[];
  chosenSubclass: { key: string; name: string } | null;
  chosenFeats: { key: string; name: string }[];
  riders: FeatureRider[];
}): string {
  const span = { klasse: ctx.delta.klasseName, von: ctx.delta.fromLevel, bis: ctx.delta.toLevel };
  return [
    `<character_summary>${JSON.stringify(ctx.summary)}</character_summary>`,
    `<level_span>${JSON.stringify(span)}</level_span>`,
    `<gained_features>${JSON.stringify(ctx.gainedFeatures.map((f) => ({ name: f.name, source: f.source })))}</gained_features>`,
    `<chosen_subclass>${JSON.stringify(ctx.chosenSubclass)}</chosen_subclass>`,
    `<chosen_feats>${JSON.stringify(ctx.chosenFeats)}</chosen_feats>`,
    `<riders>${JSON.stringify(ctx.riders)}</riders>`,
  ].join('\n');
}

/** userInput für Aufruf #1 (XML-gegliedert, JSON-Inhalt). */
export function buildQuestionsInput(ctx: {
  summary: CharacterSummary;
  delta: LevelUpDelta;
  subclassOptions: SubclassOption[];
}): string {
  return [
    `<character_summary>${JSON.stringify(ctx.summary)}</character_summary>`,
    `<level_up_delta>${JSON.stringify(ctx.delta)}</level_up_delta>`,
    `<subclass_options>${JSON.stringify(ctx.subclassOptions)}</subclass_options>`,
  ].join('\n');
}

/** userInput für Aufruf #2. */
export function buildProposalInput(ctx: {
  summary: CharacterSummary;
  delta: LevelUpDelta;
  questionnaire: LevelUpQuestionnaire;
  answers: Record<string, string | string[]>;
}): string {
  return [
    `<character_summary>${JSON.stringify(ctx.summary)}</character_summary>`,
    `<level_up_delta>${JSON.stringify(ctx.delta)}</level_up_delta>`,
    `<subclass_options>${JSON.stringify(ctx.delta.subclassOptions)}</subclass_options>`,
    `<questionnaire>${JSON.stringify(ctx.questionnaire)}</questionnaire>`,
    `<answers>${JSON.stringify(ctx.answers)}</answers>`,
  ].join('\n');
}
