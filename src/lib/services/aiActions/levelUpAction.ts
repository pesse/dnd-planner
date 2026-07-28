/**
 * KI-Aktionen für den Stufenaufstieg — die tool-freien Prosa-Pässe.
 *
 * `buildLevelUpNarrativeAction` (C): deutsche Zusammenfassung des Aufstiegs.
 *
 * Schritt D (Klassenmerkmale-Freitext + neue `sheetNote`s verschmelzen) liegt in
 * `fieldSummaryAction` — derselbe Prompt bedient die Zusammenfass-Buttons im
 * Charakter-Editor.
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
import type { PastChoice } from '../characterFeatures';
import {
  levelUpNarrativeJsonSchema,
  parseLevelUpNarrative,
  type LevelUpNarrative,
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

/** userInput für den Narrativ-Pass. */
export function buildNarrativeInput(ctx: {
  summary: CharacterSummary;
  delta: LevelUpDelta;
  gainedFeatures: GainedFeature[];
  chosenSubclass: { key: string; name: string } | null;
  chosenFeats: { key: string; name: string }[];
  riders: FeatureRider[];
  pastChoices?: PastChoice[];
}): string {
  const span = { klasse: ctx.delta.klasseName, von: ctx.delta.fromLevel, bis: ctx.delta.toLevel };
  return [
    `<character_summary>${JSON.stringify(ctx.summary)}</character_summary>`,
    ...(ctx.pastChoices?.length ? [`<past_choices>${JSON.stringify(ctx.pastChoices)}</past_choices>`] : []),
    `<level_span>${JSON.stringify(span)}</level_span>`,
    `<gained_features>${JSON.stringify(ctx.gainedFeatures.map((f) => ({ name: f.name, source: f.source })))}</gained_features>`,
    `<chosen_subclass>${JSON.stringify(ctx.chosenSubclass)}</chosen_subclass>`,
    `<chosen_feats>${JSON.stringify(ctx.chosenFeats)}</chosen_feats>`,
    `<riders>${JSON.stringify(ctx.riders)}</riders>`,
  ].join('\n');
}
