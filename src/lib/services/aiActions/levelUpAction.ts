/**
 * KI-Aktionen für den Stufenaufstieg — die tool-freien Prosa-Pässe.
 *
 * `buildLevelUpNarrativeAction` (C): deutsche Zusammenfassung des Aufstiegs.
 * `buildClassFeaturesRewriteAction` (D): bestehenden Klassenmerkmale-Freitext mit den
 *   neuen Bogen-Notizen (`sheetNote`, aus der Merkmals-Deutung) verschmelzen.
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
// Verschmelzung, keine Neuformulierung: der bestehende Feldtext stammt VOM SPIELER und
// darf alles Mögliche enthalten; die neuen Zeilen sind die bereits verdichteten
// `sheetNote`s aus der Merkmals-Deutung. Dieser Prompt fügt beides zusammen, ohne
// Information zu verlieren und ohne ein Merkmal zweimal aufzuführen.
const CLASS_FEATURES_SYSTEM = `You are a rules assistant for Dungeons & Dragons 5e (SRD 5.2 / German 5.2.1 terminology).
You merge new entries into a character's GERMAN free-text field "Klassenmerkmale & Eigenschaften" (class features & traits).
You are given the CURRENT field text (<current_text>), the already-condensed one-line notes for what the character
gained THIS level-up (<new_notes>) and the subclass in play (<chosen_subclass>).

## Task
Return the FULL merged field text: everything that was already there, plus every new note, with duplicates unified.

## Rules
1. The current text is written BY THE PLAYER and may contain notes that have nothing to do with class features
   (equipment reminders, table rulings, private notes). NEVER delete or "clean up" anything — keep every piece of
   information, even if it looks irrelevant or off-topic to you.
2. Integrate EVERY line from <new_notes>. Their wording is already condensed for the sheet — reuse it as-is unless
   merging forces a change.
3. UNIFY DUPLICATES: if a feature from <new_notes> is already mentioned in the current text, merge the two into ONE
   entry (keep the more precise/complete wording, add any detail the other one had) instead of appending a second line.
   This also applies to entries the player wrote in their own words.
4. Keep the STYLE and STRUCTURE of the current text — a bullet list stays a bullet list, plain short lines stay plain
   short lines, headings stay headings. If the field is empty, use one short line per entry.
5. Stay TERSE. The field is printed into a PDF box holding about 1400 characters in total and it grows with every
   level-up. Do not elaborate, do not add flavor text, do not restate rules at length.
6. Do NOT invent mechanics, numbers or features that are not in the input.
7. Output GERMAN only, in the single field "text". No commentary.`;

export function buildClassFeaturesRewriteAction(): AiAction<ClassFeaturesRewrite> {
  return {
    id: 'levelup-classfeatures',
    label: 'Stufenaufstieg: Klassenmerkmale zusammenführen',
    anthropicTools: [],
    openAiTools: [],
    execute: async () => '',
    jsonSchema: classFeaturesRewriteJsonSchema,
    validate: (d): d is ClassFeaturesRewrite => parseClassFeaturesRewrite(d) !== null,
    buildSystemPrompt: () => CLASS_FEATURES_SYSTEM,
  };
}

/**
 * userInput für die Klassenmerkmale-Überarbeitung.
 *
 * `newNotes` sind die `sheetNote`s der Rider (Merkmale UND Talente) — bereits verdichtet.
 * Die volle Regelprosa wird bewusst NICHT mehr mitgeschickt: sie würde diesen Pass zum
 * Nach-Formulieren einladen, obwohl die Verdichtung im Merkmals-Pass längst passiert ist.
 */
export function buildClassFeaturesInput(ctx: {
  currentText: string;
  newNotes: string[];
  chosenSubclass: { key: string; name: string } | null;
}): string {
  return [
    `<current_text>${ctx.currentText}</current_text>`,
    `<new_notes>${JSON.stringify(ctx.newNotes)}</new_notes>`,
    `<chosen_subclass>${JSON.stringify(ctx.chosenSubclass)}</chosen_subclass>`,
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
