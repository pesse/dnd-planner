/**
 * KI-Aktionen für den Stufenaufstieg — die tool-freien Prosa-Pässe.
 *
 * `buildLevelUpNarrativeAction` (C): deutsches Narrativ (Summary + Merkmals-Text).
 * `buildClassFeaturesRewriteAction` (D): Klassenmerkmale-Freitext neu formulieren.
 *
 * Alle Zahlen werden deterministisch (levelUpMachine.buildDoc) assembliert; die KI
 * liefert hier nur Prosa. Aufstieg ist nur mit Progressionsdaten möglich — der
 * frühere Homebrew-Fallback (Fragen/Vorschlag) wurde entfernt.
 *
 * Leere Tool-Arrays → `runAiAction` nimmt den tool-freien Pfad (Anthropic:
 * generateStructured; sonst generate+extractJson). Prompts ENGLISCH; nur
 * nutzer-sichtbare Feldinhalte Deutsch.
 */
import type { AiAction } from './types';
import type { LevelUpDelta } from '../levelUp';
import type { FeatureRider } from '../../schemas/levelUp';
import type { GainedFeature } from './featureEffectsAction';
import {
  levelUpNarrativeJsonSchema,
  classFeaturesRewriteJsonSchema,
  parseLevelUpNarrative,
  parseClassFeaturesRewrite,
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

// ── Dünner Narrativ-Pass (Standard-/deterministischer Pfad) ─────────────────────
// Alle Deltas werden deterministisch in levelUpMachine.buildDoc gebaut; die KI
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
