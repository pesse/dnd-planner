/**
 * KI-Aktion für Encounter (Anlage) als `EntityActionSpec`. Workflow + Boilerplate
 * stecken in factory.ts; hier nur Schema + Prosa.
 *
 * Besonderheit: Ein Encounter referenziert Monster nur per `slug`. Der eigentliche
 * „inkl. Monster"-Teil (vorhandene wiederverwenden, fehlende generieren) wird vom
 * Orchestrator services/designEncounter.ts erledigt — diese Aktion erzeugt nur das
 * Encounter-JSON selbst. Akt-Kontext, Party und die Monster-Bibliothek bekommt das
 * Modell als Kontextblöcke im User-Input (siehe designEncounter).
 */
import type { Encounter } from '../../types';
import { encounterSchema } from '../../schemas/encounter';
import { toLlmJsonSchema } from '../../schemas/llmJson';
import { parseEncounter } from '../../utils/schemaValidation';
import { buildCreateAction, type CreateActionOptions } from './factory';
import type { EntityActionSpec } from './spec';

export function isEncounter(data: unknown): data is Encounter {
  return parseEncounter(data).ok;
}

const encounterSpec: EntityActionSpec<Encounter> = {
  entity: 'encounter',
  nounDe: 'Encounter',
  currentHeading: 'Aktueller Encounter',
  // Ohne `tags`: die Schlagworte pflegt die Spielleitung von Hand, und ein optionales
  // Feld wäre für Structured Outputs ohnehin kein gültiges Schema.
  jsonSchema: toLlmJsonSchema(encounterSchema.omit({ tags: true })),
  validate: isEncounter,
  buildCreatePrompt({ nameHint }) {
    return `You are an assistant for Dungeons & Dragons (5e). From the act context and the user's wishes, design a complete combat encounter as JSON in the app schema. Write all human-readable content fields in German.

The user input contains context blocks: the act, the party, and a curated list of available monsters. Use them.

## Procedure
1. Read the act context and pick up its locations, factions, and mood. The encounter must fit the act thematically.
2. Choose the monsters and their count to suit the party (copy \`party_size\`/\`party_level\` from the party block) and the requested \`difficulty\`.
3. **Monster selection (IMPORTANT):**
   - Prefer monsters from the provided library — copy their \`slug\` EXACTLY. It is the campaign's own library and holds SRD and homebrew alike; there is no other catalogue to draw from.
   - If nothing there fits, invent a new monster and assign a descriptive kebab-case \`slug\` (e.g. "faulty-guard-drone"). Do NOT invent stat values here — the statblock is created separately; put its role/tactics into the monster's \`notes\` field.
   - Never guess a slug that is not in the library: an unknown one is treated as a new monster and gets generated from scratch.
   - The same \`slug\` may appear multiple times (e.g. two waves of the same monster type).
4. Set \`xp_total\` plausibly relative to the monsters, \`location\` fitting the act, and write an atmospheric \`read_aloud\` text (German).
5. \`notes\` for PC integration/consequences, \`status\` = "planned".
6. ALWAYS output the COMPLETE encounter JSON per the schema.${nameHint}`;
  },
  buildEditPrompt({ currentBlock }) {
    return `You are an assistant for Dungeons & Dragons (5e). You revise an EXISTING encounter according to the user's change requests and output the complete, updated encounter JSON in the app schema. Keep human-readable content fields in German.
${currentBlock}

## Procedure
1. Apply ONLY the requested changes. Unaffected fields stay UNCHANGED.
2. Monsters are referenced by \`slug\` (filename without .json) — keep existing slugs, new ones in English kebab-case.
3. Keep \`xp_total\`/\`difficulty\` consistent with the monster selection.
4. ALWAYS output the COMPLETE encounter JSON — not just the changed fields.`;
  },
};

/** „Encounter per KI anlegen" — Akt-Kontext/Party/Bibliothek kommen über den User-Input.
 *  Bewusst tool-frei: die kuratierte Bibliotheksliste steckt schon im Prompt, ein Agent-Loop
 *  würde sie nur ein zweites Mal holen. Nachschlagen darf die separate Monster-Phase in
 *  designEncounter. */
export const createEncounterAction = (opts: CreateActionOptions<Encounter> = {}) =>
  buildCreateAction(encounterSpec, opts);
