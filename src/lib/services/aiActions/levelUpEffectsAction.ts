/**
 * KI-Aktion für fortlaufende, PRO-STUFE wirkende Effekte beim Stufenaufstieg.
 *
 * Anders als `featureEffectsAction` (nur NEU gewonnene Merkmale) bekommt dieser
 * Pass den KOMPLETTEN Merkmalsbestand des Charakters (Spezies + Klasse/Subklasse
 * + Talente) und extrahiert daraus ausschließlich Effekte, die einen Wert PRO
 * STUFE ändern — heute nur das TP-Maximum (z.B. „Zwergische Zähigkeit" = +1/Stufe,
 * Talent „Zäh"/Tough = +2/Stufe). Bewusst KEINE `FeatureRider`: dieser Pass
 * berührt weder Übungen/Zauber/ASI noch den Rider-Pfad, sondern liefert nur
 * die deterministisch (× gewonnene Stufen) anzuwendende pro-Stufe-Zahl samt Quelle.
 *
 * Tool-frei → `runAiAction` nimmt den strukturierten Pfad (Anthropic) bzw.
 * generate+extractJson (sonst). Prompt ENGLISCH; nur nutzer-sichtbare Feldinhalte DE.
 */
import type { AiAction } from './types';
import {
  levelUpEffectsJsonSchema,
  parseLevelUpEffects,
  type LevelUpEffects,
} from '../../schemas/levelUp';

/** Ein Merkmal für die Effekt-Suche (Key + Name + Beschreibung, DE-bevorzugt). */
export interface EffectFeature {
  key: string; // Bibliotheks-Key; maßgebliche Referenz (kann bei Altdaten leer sein)
  name: string;
  desc: string;
}

const LEVELUP_EFFECTS_SYSTEM = `You are a rules assistant for Dungeons & Dragons 5e (SRD 5.2 / German 5.2.1 terminology).
You are given a character's COMPLETE list of features/traits (<all_features>) — species traits, class/subclass features and feats — plus the target level.
Find every effect that increases a character stat PER CHARACTER LEVEL and emit one "changes" entry per contributing feature.

## Rules
1. Only PER-LEVEL effects: features whose text says the value increases EACH TIME the character gains a level (ongoing), not one-time grants.
2. Currently the only relevant target is "hpMax": the Hit Point maximum rising per level. Examples: Dwarven Toughness (+1 per level), the Tough feat (+2 per level).
3. valueChange is the SIGNED per-level amount as a string, e.g. "+1" or "+2". Do NOT multiply by the number of levels — that is applied automatically.
4. Do NOT count: one-time/flat HP bonuses, the initial bump when a feature is first acquired (e.g. Dwarven Toughness' first +1, Tough's "twice your level" acquisition bump), temporary hit points, or Constitution-based HP (handled deterministically elsewhere).
5. source = the "key" of the causing feature, copied VERBATIM from the matching <all_features> entry. Only leave it empty if that entry's key is itself empty.
6. If a feature has no per-level effect, emit nothing for it. If none apply, return an empty "changes" array.`;

export function buildLevelUpEffectsAction(): AiAction<LevelUpEffects> {
  return {
    id: 'levelup-ongoing-effects',
    label: 'Stufenaufstieg: fortlaufende Effekte',
    anthropicTools: [],
    openAiTools: [],
    execute: async () => '',
    jsonSchema: levelUpEffectsJsonSchema,
    validate: (d): d is LevelUpEffects => parseLevelUpEffects(d) !== null,
    buildSystemPrompt: () => LEVELUP_EFFECTS_SYSTEM,
  };
}

/** userInput für die Effekt-Suche (XML-gegliedert, JSON-Inhalt). */
export function buildLevelUpEffectsInput(ctx: {
  level: number;
  features: EffectFeature[];
}): string {
  return [
    `<target_level>${ctx.level}</target_level>`,
    `<all_features>${JSON.stringify(ctx.features)}</all_features>`,
  ].join('\n');
}
