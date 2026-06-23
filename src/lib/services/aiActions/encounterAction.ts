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
import { toLlmJsonSchema } from '../../schemas/shared';
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
  jsonSchema: toLlmJsonSchema(encounterSchema),
  validate: isEncounter,
  buildCreatePrompt({ nameHint }) {
    return `Du bist ein Assistent für Dungeons & Dragons (5e). Du entwirfst aus dem Akt-Kontext und den Wünschen des Nutzers einen kompletten Kampf-Encounter als JSON im App-Schema (Deutsch).

Der User-Input enthält Kontextblöcke: den Akt, die Party und die bereits vorhandene Monster-Bibliothek. Nutze sie.

## Vorgehen
1. Lies den Akt-Kontext und greife dessen Orte, Fraktionen und Stimmung auf. Der Encounter soll thematisch in den Akt passen.
2. Wähle die Monster und ihre Anzahl passend zur Party (\`party_size\`/\`party_level\` aus dem Party-Block übernehmen) und zur gewünschten \`difficulty\`.
3. **Monster-Auswahl (WICHTIG):**
   - Bevorzuge Monster aus der mitgelieferten Bibliothek — übernimm deren \`slug\` EXAKT.
   - Passt nichts, darf es ein SRD-Monster sein: nutze \`search_dnd_api\` (category "monsters", englischer Begriff) und verwende den dortigen Index als \`slug\`.
   - Brauchst du ein neues, eigenes Monster, vergib einen sprechenden \`slug\` in kebab-case (z.B. "fehlerhafte-wachdrohne"). Erfinde KEINE Statwerte hier — der Statblock wird separat erzeugt; gib im \`notes\`-Feld des Monsters seine Rolle/Taktik an.
   - Derselbe \`slug\` darf mehrfach vorkommen (z.B. zwei Wellen desselben Monstertyps).
4. Setze \`xp_total\` plausibel zur Summe der Monster, \`location\` passend zum Akt, und schreibe einen atmosphärischen \`read_aloud\`-Vorlesetext.
5. \`notes\` für PC-Integration/Konsequenzen, \`status\` = "planned".
6. Gib IMMER das VOLLSTÄNDIGE Encounter-JSON gemäß Schema aus.${nameHint}`;
  },
  buildEditPrompt({ currentBlock }) {
    return `Du bist ein Assistent für Dungeons & Dragons (5e). Du überarbeitest einen BESTEHENDEN Encounter gemäß den Änderungswünschen des Nutzers und gibst das vollständige, aktualisierte Encounter-JSON im App-Schema (Deutsch) aus.
${currentBlock}

## Vorgehen
1. Wende AUSSCHLIESSLICH die gewünschten Änderungen an. Nicht betroffene Felder bleiben UNVERÄNDERT.
2. Monster werden per \`slug\` referenziert (Dateiname ohne .json) — bestehende Slugs beibehalten, neue in kebab-case.
3. Halte \`xp_total\`/\`difficulty\` zur Monster-Auswahl konsistent.
4. Gib IMMER das VOLLSTÄNDIGE Encounter-JSON aus — nicht nur die geänderten Felder.`;
  },
};

/** „Encounter per KI anlegen" — Akt-Kontext/Party/Bibliothek kommen über den User-Input. */
export const createEncounterAction = (opts: CreateActionOptions<Encounter> = {}) =>
  buildCreateAction(encounterSpec, opts);
