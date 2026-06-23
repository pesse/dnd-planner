/**
 * KI-Aktion „Monster per KI überarbeiten“: ein BESTEHENDES Monster wird gemäß einer
 * freien Anweisung des Nutzers angepasst und als vollständiges Monster-JSON ausgegeben.
 */
import type { Monster } from '../../types';
import { parseMonster } from '../../utils/schemaValidation';
import { DND_TOOLS_ANTHROPIC, DND_TOOLS_OPENAI, executeDndTool } from '../dndApiTools';
import type { AiAction } from './types';

const ACTION_ARRAY = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'description'],
    properties: {
      name: { type: 'string' },
      description: { type: 'string' },
      attack_bonus: { type: 'integer' },
      damage: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['dice', 'type'],
          properties: { dice: { type: 'string' }, type: { type: 'string' } },
        },
      },
    },
  },
} as const;

/** JSON-Schema des Monster-Outputs (deutsch, Schema der App). */
export const MONSTER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'size', 'type', 'alignment', 'ac', 'hp', 'speed', 'stats', 'cr'],
  properties: {
    name: { type: 'string' },
    size: { type: 'string', description: 'Tiny | Small | Medium | Large | Huge | Gargantuan' },
    type: { type: 'string', description: 'engl. Creature-Type: beast, humanoid, dragon, giant, undead, …' },
    alignment: { type: 'string', description: 'engl. Gesinnung, z.B. "chaotic evil"' },
    ac: {
      type: 'object', additionalProperties: false, required: ['value', 'note'],
      properties: { value: { type: 'integer' }, note: { type: 'string' } },
    },
    hp: {
      type: 'object', additionalProperties: false, required: ['average', 'formula'],
      properties: { average: { type: 'integer' }, formula: { type: 'string', description: 'z.B. "2d8+2"' } },
    },
    speed: { type: 'string', description: 'z.B. "9 m", ggf. mit Flug/Schwimmen' },
    stats: {
      type: 'object', additionalProperties: false,
      required: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
      properties: {
        str: { type: 'integer' }, dex: { type: 'integer' }, con: { type: 'integer' },
        int: { type: 'integer' }, wis: { type: 'integer' }, cha: { type: 'integer' },
      },
    },
    saving_throws: { type: 'object', additionalProperties: { type: 'string' }, description: 'z.B. {"con":"+4"}' },
    skills: { type: 'object', additionalProperties: { type: 'string' }, description: 'z.B. {"Heimlichkeit":"+6"}' },
    damage_resistances: { type: 'array', items: { type: 'string' } },
    damage_immunities: { type: 'array', items: { type: 'string' } },
    condition_immunities: { type: 'array', items: { type: 'string' } },
    senses: { type: 'string' },
    languages: { type: 'string' },
    cr: { type: 'string', description: 'Herausforderungsgrad, z.B. "1/4", "5"' },
    xp: { type: 'integer' },
    traits: ACTION_ARRAY,
    actions: ACTION_ARRAY,
    reactions: ACTION_ARRAY,
    legendary_actions: ACTION_ARRAY,
  },
} as const;

export function isMonster(data: unknown): data is Monster {
  return parseMonster(data).ok;
}

export interface CreateMonsterOptions {
  /** Bestehendes Monster als Ausgangspunkt (macht die API-Recherche optional). */
  template?: Monster;
  /** Vom Nutzer gewünschter Name. */
  name?: string;
}

/** Erzeugt die Aktion „Monster per KI anlegen“ (mit optionaler DnD-API-Recherche). */
export function createMonsterAction(opts: CreateMonsterOptions = {}): AiAction<Monster> {
  const { template, name } = opts;
  const nameHint = name ? `\n\nGewünschter Name: **„${name}“**.` : '';

  return {
    id: 'create-monster',
    label: 'Monster per KI anlegen',
    anthropicTools: DND_TOOLS_ANTHROPIC,
    openAiTools: DND_TOOLS_OPENAI,
    execute: executeDndTool,
    jsonSchema: MONSTER_SCHEMA,
    validate: isMonster,
    buildSystemPrompt() {
      if (template) {
        return `Du bist ein Assistent für Dungeons & Dragons (5e). Du erstellst aus einer Vorlage und den Wünschen des Nutzers einen Monster-Statblock als JSON im App-Schema.

## Vorlage (Ausgangspunkt)
\`\`\`json
${JSON.stringify(template, null, 2)}
\`\`\`

## Vorgehen
1. Nutze die Vorlage als Basis und übernimm ihre Werte, solange die Beschreibung nichts anderes verlangt.
2. Wende die Wünsche des Nutzers an und halte die Werte spielmechanisch konsistent (cr/xp passend zu HP, AC, Schaden).
3. Die DnD-API-Tools (category "monsters") stehen bereit — nutze sie NUR, wenn dir Referenzwerte fehlen.
4. \`type\`/\`alignment\` sind englische Schlüssel; beschreibende Texte auf Deutsch. Gib IMMER das VOLLSTÄNDIGE Monster-JSON aus.${nameHint}`;
      }
      return `Du bist ein Assistent für Dungeons & Dragons (5e). Aus einer Beschreibung erstellst du einen Monster-Statblock als JSON im App-Schema.

## Vorgehen
1. Gibt es ein passendes SRD-Monster, suche es mit \`search_dnd_api\` (category "monsters", englischer Begriff) und lade es mit \`get_dnd_api_resource\` als Basis.
2. Andernfalls baue das Monster plausibel selbst (Homebrew) mit konsistenten Werten (cr/xp passend zu HP, AC, Schaden).
3. \`type\`/\`alignment\` sind englische Schlüssel; beschreibende Texte (Aktionen, Eigenschaften) auf Deutsch.
4. Gib IMMER das VOLLSTÄNDIGE Monster-JSON gemäß Schema aus.${nameHint}`;
    },
  };
}

/** Erzeugt die Aktion „Monster per KI überarbeiten“ mit dem aktuellen Monster als Kontext. */
export function editMonsterAction(current: Monster): AiAction<Monster> {
  return {
    id: 'edit-monster',
    label: 'Monster per KI überarbeiten',
    anthropicTools: [],
    openAiTools: [],
    execute: async () => '',
    jsonSchema: MONSTER_SCHEMA,
    validate: isMonster,
    buildSystemPrompt() {
      return `Du bist ein Assistent für Dungeons & Dragons (5e). Du überarbeitest einen BESTEHENDEN Monster-Statblock gemäß den Änderungswünschen des Nutzers und gibst das vollständige, aktualisierte Monster-JSON im App-Schema (Deutsch) aus.

## Aktuelles Monster
\`\`\`json
${JSON.stringify(current, null, 2)}
\`\`\`

## Vorgehen
1. Wende AUSSCHLIESSLICH die gewünschten Änderungen an. Alle nicht betroffenen Felder bleiben UNVERÄNDERT erhalten.
2. Halte die Werte spielmechanisch konsistent (z.B. passt der Herausforderungsgrad \`cr\`/\`xp\` zu HP, AC und Schaden).
3. Beschreibungen/Aktionstexte auf Deutsch. \`type\` und \`alignment\` bleiben englische Schlüssel.
4. Gib IMMER das VOLLSTÄNDIGE Monster-JSON aus — nicht nur die geänderten Felder.`;
    },
  };
}
