/**
 * Prompt-Kandidaten für die featureEffects-Eval.
 *
 * Es wird immer GENAU EIN Prompt ausgewertet (siehe harness `runEval`). Um Prompts
 * zu vergleichen, läuft man die Eval mehrmals mit unterschiedlichem `EVAL_PROMPT`
 * — jeder Lauf schreibt einen eigenen Report (Titel = Prompt-Name), die man extern
 * nebeneinanderlegt.
 *
 * `baseline` wird direkt aus der Produktions-Action gezogen (Single Source, kein
 * Drift). Weitere Einträge sind Experimentierfassungen zum Tunen.
 */
import { buildFeatureEffectsAction } from '../../src/lib/services/aiActions/featureEffectsAction';

/** Der aktuelle Produktions-System-Prompt (aus der Action gezogen). */
export const FEATURE_EFFECTS_BASELINE = buildFeatureEffectsAction().buildSystemPrompt();

/** Gekürzte Kandidaten-Fassung. Startpunkt zum Tunen — Regeln bewusst verdichtet. */
export const FEATURE_EFFECTS_CANDIDATE = `You are a D&D 5e rules assistant (SRD 5.2 / German 5.2.1). Given <gained_features> (features/feats a character JUST gained) plus class context, output ONLY concrete, app-modellable mechanical effects as typed "riders". Skip purely narrative features; return an empty "riders" array if nothing is modellable.

Per rider, capture what applies:
- grantedSpells: spells made ALWAYS PREPARED for free (subclass/circle/domain lists, feat-granted spells). Canonical ENGLISH names. Never spells the player merely MAY learn.
- extraCantrips / extraPreparedCount: only amounts BEYOND the class table.
- expertiseCount/expertiseOptions, fightingStyle/fightingStyleOptions, proficiencies.
- abilityScoreIncrease: only fixed bonuses a feat itself dictates, never the generic ASI. German keys: str, ges, kon, int, wei, cha.
- choicePrompts: when a feature FORCES a player choice. type "choice"/"multiselect" with options if known, else "text". All prompt/help/label text GERMAN, stable ids.
  resolvesEffects=true ONLY when the answer unlocks further grants you cannot state yet (leave those grants empty for now); false when the answer IS the effect.

<resolved_choices> (if present): treat each as final; output the concrete grants it now yields (ENGLISH spell names where applicable), keep that choicePrompt but set resolvesEffects=false. Never re-ask a resolved choice.

Do NOT restate deterministic numbers (spell slots, proficiency bonus, hit die).`;

/** Registry aller wählbaren Prompts (EVAL_PROMPT wählt einen aus). */
export const FEATURE_EFFECTS_PROMPTS: Record<string, string> = {
  baseline: FEATURE_EFFECTS_BASELINE,
  candidate: FEATURE_EFFECTS_CANDIDATE,
};

/** Löst den per Name gewählten Prompt auf (Default: baseline). Wirft bei unbekanntem Namen. */
export function resolveFeatureEffectsPrompt(name = 'baseline'): { name: string; systemPrompt: string } {
  const systemPrompt = FEATURE_EFFECTS_PROMPTS[name];
  if (!systemPrompt) {
    const available = Object.keys(FEATURE_EFFECTS_PROMPTS).join(', ');
    throw new Error(`Unbekannter EVAL_PROMPT="${name}". Verfügbar: ${available}`);
  }
  return { name, systemPrompt };
}
