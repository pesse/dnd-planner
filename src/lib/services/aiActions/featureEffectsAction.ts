/**
 * KI-Aktion für die Deutung neu gewonnener Merkmale/Talente beim Stufenaufstieg.
 *
 * Bekommt AUSSCHLIESSLICH die in dieser Spanne neu gewonnenen Merkmale (Basis-,
 * Subklassen- oder Talent-Prosa) und extrahiert daraus die konkreten mechanischen
 * „Rider": gewährte (immer vorbereitete) Zauber, Extra-Zaubertricks, zusätzliche
 * vorbereitbare Zauber, Expertise, Fighting-Style-Optionen, Profizienzen, feste
 * Attributsboni und erzwungene Spielerwahlen (choicePrompts).
 *
 * Tool-frei → `runAiAction` nimmt den strukturierten Pfad (Anthropic) bzw.
 * generate+extractJson (sonst). Prompt ENGLISCH; nur nutzer-sichtbare Feldinhalte DE.
 */
import type { AiAction } from './types';
import type { CharacterSummary } from './levelUpAction';
import {
  featureEffectsJsonSchema,
  parseFeatureEffects,
  type FeatureEffects,
} from '../../schemas/levelUp';

/** Einheitliche Eingabe-Einheit für die Effekt-Deutung (Merkmal ODER Talent). */
export interface GainedFeature {
  name: string;
  desc: string;
  source: 'class' | 'subclass' | 'feat';
  gainedAt: number;
}

/** Knapper Klassen-Kontext für die Effekt-Deutung. */
export interface FeatureClassContext {
  klasseName: string;
  casterType: string; // FULL/HALF/NONE/…
  casterKind: 'prepared' | 'known' | 'none';
  spellcastingAbility: string;
  toLevel: number;
}

const FEATURE_EFFECTS_SYSTEM = `You are a rules assistant for Dungeons & Dragons 5e (SRD 5.2 / German 5.2.1 terminology).
You are given the game features/feats a character has JUST gained (<gained_features>) plus class context.
Extract ONLY the concrete, app-modellable mechanical effects each feature grants — as a list of typed "riders".

## Rules
1. Emit a rider ONLY for a feature that carries a concrete mechanical grant. Purely narrative/flavor features → no rider.
2. grantedSpells: spells a feature makes ALWAYS PREPARED / grants for free (e.g. a subclass spell list, a domain/circle spell list, a feat that grants a spell). Use canonical ENGLISH SRD spell names. Do NOT include spells the player merely MAY learn — those are handled elsewhere.
3. extraCantrips / extraPreparedCount: only if a feature explicitly grants additional cantrips resp. lets the player prepare MORE spells than the class table already does.
4. expertiseCount / expertiseOptions: for features granting Expertise (double proficiency); list plausible skill names/keys.
5. fightingStyle: set true if the feature grants a Fighting Style; fill fightingStyleOptions (value = short key, label = GERMAN) if you know them.
6. proficiencies: skills/tools/weapons/armor/languages/savingThrows the feature grants (short names).
7. abilityScoreIncrease: ONLY fixed ability increases the feature itself dictates (e.g. a feat giving +1 CON). NEVER the generic ASI (that is a player choice handled separately). German ability keys: str, ges (dex), kon, int, wei (wis), cha.
8. choicePrompts: if a feature FORCES a player choice (e.g. Fighting Style selection, "+1 to one of two abilities", pick a spell from a list), emit a typed question. Use type "choice"/"multiselect" with options where you know them, else "text". Every prompt/help/label MUST be GERMAN. Use stable ids like "choice_<featureslug>_1".
9. Do NOT restate deterministic numbers (spell slots, proficiency bonus, hit die) — they are applied automatically. Only add value the raw table cannot express.
10. If nothing is modellable, return an empty "riders" array.`;

export function buildFeatureEffectsAction(): AiAction<FeatureEffects> {
  return {
    id: 'levelup-feature-effects',
    label: 'Stufenaufstieg: Merkmals-Effekte',
    anthropicTools: [],
    openAiTools: [],
    execute: async () => '',
    jsonSchema: featureEffectsJsonSchema,
    validate: (d): d is FeatureEffects => parseFeatureEffects(d) !== null,
    buildSystemPrompt: () => FEATURE_EFFECTS_SYSTEM,
  };
}

/** userInput für die Effekt-Deutung (XML-gegliedert, JSON-Inhalt). */
export function buildFeatureEffectsInput(ctx: {
  summary: CharacterSummary;
  classContext: FeatureClassContext;
  features: GainedFeature[];
}): string {
  return [
    `<character_summary>${JSON.stringify(ctx.summary)}</character_summary>`,
    `<class_context>${JSON.stringify(ctx.classContext)}</class_context>`,
    `<gained_features>${JSON.stringify(ctx.features)}</gained_features>`,
  ].join('\n');
}
