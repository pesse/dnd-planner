/**
 * KI-Aktion „Zauber per KI überarbeiten“: ein BESTEHENDER Zauber wird gemäß einer
 * freien Anweisung des Nutzers angepasst und als vollständiges Spell-JSON ausgegeben.
 */
import type { Spell } from '../../types';
import { parseSpell } from '../../utils/schemaValidation';
import { DND_TOOLS_ANTHROPIC, DND_TOOLS_OPENAI, executeDndTool } from '../dndApiTools';
import type { AiAction } from './types';

/** JSON-Schema des Spell-Outputs (Schema der App). */
export const SPELL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'level', 'school', 'casting_time', 'range', 'components', 'duration', 'desc', 'source'],
  properties: {
    name: { type: 'string' },
    level: { type: 'integer', description: '0 = Zaubertrick, 1–9' },
    school: { type: 'string', description: 'engl. Schule: abjuration, conjuration, divination, enchantment, evocation, illusion, necromancy, transmutation' },
    casting_time: { type: 'string' },
    range: { type: 'string' },
    components: {
      type: 'object', additionalProperties: false,
      required: ['verbal', 'somatic', 'material', 'materials_needed'],
      properties: {
        verbal: { type: 'boolean' },
        somatic: { type: 'boolean' },
        material: { type: 'boolean' },
        materials_needed: { type: ['string', 'null'] },
      },
    },
    duration: { type: 'string' },
    concentration: { type: 'boolean' },
    ritual: { type: 'boolean' },
    classes: { type: 'array', items: { type: 'string' } },
    desc: { type: 'array', items: { type: 'string' }, description: 'Beschreibung (Absätze).' },
    desc_de: { type: 'array', items: { type: 'string' }, description: 'Deutsche Beschreibung.' },
    higher_level: { type: ['array', 'null'], items: { type: 'string' } },
    higher_level_de: { type: ['array', 'null'], items: { type: 'string' } },
    source: { type: 'string' },
  },
} as const;

export function isSpell(data: unknown): data is Spell {
  return parseSpell(data).ok;
}

export interface CreateSpellOptions {
  template?: Spell;
  name?: string;
}

/** Erzeugt die Aktion „Zauber per KI anlegen“ (mit optionaler DnD-API-Recherche). */
export function createSpellAction(opts: CreateSpellOptions = {}): AiAction<Spell> {
  const { template, name } = opts;
  const nameHint = name ? `\n\nGewünschter Name: **„${name}“**.` : '';

  return {
    id: 'create-spell',
    label: 'Zauber per KI anlegen',
    anthropicTools: DND_TOOLS_ANTHROPIC,
    openAiTools: DND_TOOLS_OPENAI,
    execute: executeDndTool,
    jsonSchema: SPELL_SCHEMA,
    validate: isSpell,
    buildSystemPrompt() {
      if (template) {
        return `Du bist ein Assistent für Dungeons & Dragons (5e). Du erstellst aus einer Vorlage und den Wünschen des Nutzers einen Zauber als JSON im App-Schema.

## Vorlage (Ausgangspunkt)
\`\`\`json
${JSON.stringify(template, null, 2)}
\`\`\`

## Vorgehen
1. Nutze die Vorlage als Basis; wende die Wünsche des Nutzers an.
2. DnD-API-Tools (category "spells") nur bei fehlenden Referenzwerten nutzen.
3. \`school\` ist ein englischer Schlüssel, \`level\` 0–9. Gib IMMER das VOLLSTÄNDIGE Spell-JSON aus.${nameHint}`;
      }
      return `Du bist ein Assistent für Dungeons & Dragons (5e). Aus einer Beschreibung erstellst du einen Zauber als JSON im App-Schema.

## Vorgehen
1. Gibt es einen passenden SRD-Zauber, suche ihn mit \`search_dnd_api\` (category "spells", englischer Begriff) und lade ihn mit \`get_dnd_api_resource\` als Basis.
2. Andernfalls baue den Zauber plausibel selbst mit konsistenten Werten.
3. \`school\` ist ein englischer Schlüssel, \`level\` 0–9.
4. Gib IMMER das VOLLSTÄNDIGE Spell-JSON gemäß Schema aus.${nameHint}`;
    },
  };
}

/** Erzeugt die Aktion „Zauber per KI überarbeiten“ mit dem aktuellen Zauber als Kontext. */
export function editSpellAction(current: Spell): AiAction<Spell> {
  return {
    id: 'edit-spell',
    label: 'Zauber per KI überarbeiten',
    anthropicTools: [],
    openAiTools: [],
    execute: async () => '',
    jsonSchema: SPELL_SCHEMA,
    validate: isSpell,
    buildSystemPrompt() {
      return `Du bist ein Assistent für Dungeons & Dragons (5e). Du überarbeitest einen BESTEHENDEN Zauber gemäß den Änderungswünschen des Nutzers und gibst das vollständige, aktualisierte Spell-JSON im App-Schema aus.

## Aktueller Zauber
\`\`\`json
${JSON.stringify(current, null, 2)}
\`\`\`

## Vorgehen
1. Wende AUSSCHLIESSLICH die gewünschten Änderungen an. Alle nicht betroffenen Felder bleiben UNVERÄNDERT erhalten.
2. Pflege Beschreibungs-Änderungen konsistent in \`desc\` (Original) und – falls vorhanden – \`desc_de\` (Deutsch) ein.
3. \`school\` bleibt ein englischer Schlüssel; \`level\` 0–9.
4. Gib IMMER das VOLLSTÄNDIGE Spell-JSON aus — nicht nur die geänderten Felder.`;
    },
  };
}
