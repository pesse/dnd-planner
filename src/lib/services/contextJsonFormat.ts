/**
 * Der Schema-Abschnitt des System-Prompts für generierbare Entitäten.
 * Handgeschriebener Prompt-Text und damit Inhalt, nicht Kommentar.
 */
import type { FileEntry } from '../types';
import { monsterSchema } from '../schemas/monster';
import { toLlmJsonSchema } from '../schemas/llmJson';

const HEAD = [
  '\n## JSON Format for Generation',
  'When outputting a monster, encounter, or NPC, wrap it in a single ```json ... ``` block.',
  '**CRITICAL rules — violation will break the app:**',
  '- Output EXACTLY the fields listed below — no extra fields, no omissions.',
  '- Use the exact field names (snake_case, lowercase).',
  '- Respect the listed types strictly (number vs string, array vs object).',
  '- Enum values must match exactly (case-sensitive).',
  '- Never add markdown, prose, or comments inside the JSON block.',
  '- Output only ONE JSON object per block (no arrays at top level).',
];

const ENCOUNTER_SCHEMA =
  '\n**Encounter schema** (all fields required):\n```\n' +
  '{\n' +
  '  "name": string,\n' +
  '  "description": string,\n' +
  '  "read_aloud": string,\n' +
  '  "monsters": [ { "slug": string, "count": number, "notes": string } ],\n' +
  '  "difficulty": "leicht" | "mittel" | "schwer" | "tödlich",\n' +
  '  "xp_total": number,\n' +
  '  "party_size": number,\n' +
  '  "party_level": number,\n' +
  '  "location": string,\n' +
  '  "loot": string,\n' +
  '  "notes": string,\n' +
  '  "status": "planned" | "done" | "skipped"\n' +
  '}\n```\n' +
  'Notes: `monsters[].slug` must match an existing monster filename (without .json). ' +
  'Use empty string "" for unknown slugs, 0 for unknown numbers, [] for empty arrays. ' +
  'The same slug may appear multiple times in the array (e.g. two separate waves of the same monster type). ' +
  '`read_aloud` is an optional atmospheric text for the DM to read aloud to players; use "" if not applicable.';

// Generiert statt abgeschrieben: die frühere Handkopie stand drei Schemaänderungen hinterher.
const MONSTER_SCHEMA =
  '\n**Monster schema** (JSON Schema):\n```json\n' +
  JSON.stringify(toLlmJsonSchema(monsterSchema), null, 2) +
  '\n```\n' +
  'Notes: all distances (`speed.*`, `senses.*`, `attacks[].reach`/`range`/`long_range`) are integers in FEET. ' +
  '`challenge_rating` is a number, not a string ("1/4" → 0.25). ' +
  '`saving_throws`/`skill_bonuses` hold only proficient entries, keyed in English. ' +
  '`name`/`desc` carry the German display text, `name_en`/`desc_en` the English original.';

const NPC_SCHEMA =
  '\n**NPC schema** (all fields required):\n```\n' +
  '{\n' +
  '  "name": string,\n' +
  '  "role": string,\n' +
  '  "status": "lebendig" | "tot" | "vermisst" | "unbekannt",\n' +
  '  "appearance": string,\n' +
  '  "personality": string,\n' +
  '  "motivation": string,\n' +
  '  "secret": string,\n' +
  '  "notes": string,\n' +
  '  "ac": number,\n' +
  '  "hp": string,\n' +
  '  "speed": string,\n' +
  '  "stats": { "str": number, "dex": number, "con": number, "int": number, "wis": number, "cha": number },\n' +
  '  "savingThrows": { "<ability>": { "bonus": number, "prof": boolean } },\n' +
  '  "skills": { "<skill>": { "bonus": number, "prof": boolean } },\n' +
  '  "spells": [ { "name": string, "level": number } ],\n' +
  '  "inventory": string[],\n' +
  '  "tags": string[]\n' +
  '}\n```\n' +
  'Notes: `hp` is a string like "27 (5W8+5)". ' +
  '`savingThrows` uses ability keys: str, dex, con, int, wis, cha — only include saves with proficiency or a bonus deviating from the plain ability modifier. ' +
  '`skills` uses ONLY these valid D&D 5e skill names: Akrobatik, ArkaneKunde, Athletik, Auftreten, Einschüchtern, Fingerfertigkeit, Geschichte, Heilkunde, Heimlichkeit, MitTierenUmgehen, MotivErkennen, Nachforschungen, Naturkunde, Religion, Täuschen, Überlebenskunst, Überzeugen, Wahrnehmung — only include skills with proficiency or a notable bonus. ' +
  '`speed` uses meters (e.g. "9 m"), NOT feet. ' +
  '`spells` level 0 = Zaubertrick, 1–9 = Zaubergrad. `inventory` is a list of notable items as individual strings. Use "" for unknown strings, 0 for unknown numbers, [] for empty arrays.';

/** Der Akt bekommt Monster UND Encounter, weil beide aus ihm heraus entstehen. */
export function renderJsonFormat(type: FileEntry['type'] | undefined): string | null {
  if (type !== 'encounter' && type !== 'monster' && type !== 'act' && type !== 'npc') return null;
  const lines = [...HEAD];
  if (type === 'encounter' || type === 'act') lines.push(ENCOUNTER_SCHEMA);
  if (type === 'monster' || type === 'act') lines.push(MONSTER_SCHEMA);
  if (type === 'npc') lines.push(NPC_SCHEMA);
  return lines.join('\n');
}
