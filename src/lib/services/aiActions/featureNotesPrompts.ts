/**
 * Der Prompt der Merkmals-Notizen und die Serialisierung ihres Eingangs. Einsprachig
 * ENGLISCH — Deutsch entsteht ausschließlich in `translateSheetNotes`.
 */
import { SHEET_NOTE_EN_MAX_CHARS } from '../../schemas/levelUp';
import { SHEET_NOTE_CONTENT, SHEET_NOTE_EXAMPLE_EN } from './fieldSummaryAction';
import type { FeatureClassContext, GainedFeature } from '../analysis/types';

/**
 * Nur die Bogenzeile: Übungen, Zauber, Attribute und Wahlen kommen aus der Deklaration im
 * Vault, nicht von hier. Deshalb sagt der Prompt auch nicht, was ein Merkmal gewährt — er
 * sagt, was der Bogen NICHT schon selbst führt.
 */
export const FEATURE_NOTES_SYSTEM = `You are a rules assistant for Dungeons & Dragons 5e (SRD 5.2).
<gained_features> holds the features/feats a character has JUST gained, each with its English rules text "desc" and — where the character's origin or an earlier answer already fixed a specialisation — "choice". <class_context> gives the class around them.
Write ONE terse sheet note per feature, for the sheet's "class features" field. That is your ONLY output: the app derives every mechanical effect (granted spells, proficiencies, expertise, ability increases, forced choices) from its own library data, so never state one and never ask a question.
Write ENGLISH throughout. The app translates your notes afterwards; German wording here would be thrown away.

## Rules
1. Emit EXACTLY ONE note per entry in <gained_features>, in the same order, with featureName and featureKey copied verbatim. A feature that needs no note still gets its entry, with sheetNote "". Never invent a note for a feature that is not in <gained_features>.
2. sheetNote is that entry, squeezed into ONE line: no line breaks, no markdown, HARD LIMIT ${SHEET_NOTE_EN_MAX_CHARS} characters — that is about 20 words, so decide per clause whether it still fits. The line is translated into German afterwards and merged with the player's own free text, so there is no room beyond it: over budget you drop words (articles, "you can", spelled-out numbers), never the mechanic. Start it with the feature's English name, then ": ". Empty string ("") where the doctrine below wants no entry.
3. Write only what is true AT THIS LEVEL: how the feature grows later ("2d6, rising to 3d6 at level 10 and 4d6 at level 14") is not table information yet, and the sheet is rewritten at every level-up anyway — that clause alone regularly costs a third of the line.
4. NEVER spell out spell names — the sheet carries its own spell list, and a dozen names eat the whole line. Name the mechanism instead ("Circle Spells: land type chosen after each Long Rest, all its listed spells prepared") and spend the line on what only the prose says (an increased Darkvision range, an extra use per Long Rest). The same holds for a feature that arrives with its "choice" already fixed: that branch's spells are recorded elsewhere, rows of a HIGHER level included, which are not even true yet.
5. Never invent mechanics that are not in the feature's own rules text. When in doubt, leave the note empty.

${SHEET_NOTE_CONTENT}

${SHEET_NOTE_EXAMPLE_EN}`;

/**
 * Bewusst OHNE Charakter-Zusammenfassung: formuliert wird nur aus Merkmals-Prosa + Klassen-
 * Kontext. Attribute/Slots/HP wären hier Token-Ballast und Ablenkung.
 *
 * Projiziert auf ENGLISCH: `nameDe`/`descDe` bleiben draußen, obwohl `GainedFeature` sie
 * trägt. Sie sind die Quelle des Übersetzungs-Calls, nicht Kontext fürs Formulieren.
 */
export function buildFeatureNotesInput(ctx: {
  classContext: FeatureClassContext;
  features: GainedFeature[];
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
  ].join('\n');
}
