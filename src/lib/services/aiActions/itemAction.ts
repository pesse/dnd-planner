/**
 * KI-Aktion „Gegenstand anlegen“.
 *
 * Workflow: aus deutscher Beschreibung englische DnD-API-Suche ableiten →
 * passendste Basis laden → Spielwerte übernehmen → spezifische Änderungen
 * (Name, Beschreibung, Seltenheit) ergänzen → `Item`-JSON ausgeben.
 */
import type { Item } from '../../types';
import { DND_TOOLS_ANTHROPIC, DND_TOOLS_OPENAI, executeDndTool } from '../dndApiTools';
import { CATEGORY_LABELS } from '../../itemLibrary';
import type { AiAction } from './types';

/** JSON-Schema des `Item`-Outputs (Structured-Outputs-Subset: keine min/max/length). */
export const ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'desc', 'source'],
  properties: {
    index: { type: 'string', description: 'API-Slug der Basis (z.B. "warhammer"), leer bei Homebrew.' },
    name: { type: 'string', description: 'Originalname (Englisch).' },
    name_de: { type: 'string', description: 'Deutscher Name.' },
    item_type: { type: 'string', enum: ['weapon', 'armor', 'magic', 'gear'] },
    equipment_category: {
      type: 'object',
      additionalProperties: false,
      required: ['index', 'name'],
      properties: { index: { type: 'string' }, name: { type: 'string' } },
    },
    rarity: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: { name: { type: 'string', description: 'z.B. Uncommon, Rare, Very Rare, Legendary' } },
    },
    attunement: { type: 'boolean' },
    attunement_by: { type: ['string', 'null'] },
    weapon_category: { type: 'string', description: 'Simple | Martial' },
    weapon_range: { type: 'string', description: 'Melee | Ranged' },
    damage: {
      type: 'object',
      additionalProperties: false,
      required: ['damage_dice', 'damage_type'],
      properties: {
        damage_dice: { type: 'string', description: 'z.B. "1d8".' },
        damage_type: {
          type: 'object',
          additionalProperties: false,
          required: ['index', 'name'],
          properties: { index: { type: 'string' }, name: { type: 'string' } },
        },
      },
    },
    two_handed_damage: {
      type: 'object',
      additionalProperties: false,
      required: ['damage_dice', 'damage_type'],
      properties: {
        damage_dice: { type: 'string' },
        damage_type: {
          type: 'object',
          additionalProperties: false,
          required: ['index', 'name'],
          properties: { index: { type: 'string' }, name: { type: 'string' } },
        },
      },
    },
    range: {
      type: 'object',
      additionalProperties: false,
      required: ['normal'],
      properties: { normal: { type: 'number' }, long: { type: ['number', 'null'] } },
    },
    properties: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'name'],
        properties: { index: { type: 'string' }, name: { type: 'string' } },
      },
    },
    armor_category: { type: 'string', description: 'Light | Medium | Heavy | Shield' },
    armor_class: {
      type: 'object',
      additionalProperties: false,
      required: ['base', 'dex_bonus', 'max_bonus'],
      properties: {
        base: { type: 'integer' },
        dex_bonus: { type: 'boolean' },
        max_bonus: { type: ['integer', 'null'] },
      },
    },
    str_minimum: { type: 'integer' },
    stealth_disadvantage: { type: 'boolean' },
    desc: { type: 'array', items: { type: 'string' }, description: 'Beschreibung (Englisch), je Absatz ein Eintrag.' },
    desc_de: { type: 'array', items: { type: 'string' }, description: 'Beschreibung (Deutsch).' },
    cost: {
      type: 'object',
      additionalProperties: false,
      required: ['quantity', 'unit'],
      properties: { quantity: { type: 'number' }, unit: { type: 'string', description: 'gp | sp | cp | ep | pp' } },
    },
    weight: { type: ['number', 'null'], description: 'in lbs.' },
    source: { type: 'string', description: 'Herkunft, hier "KI".' },
  },
} as const;

export function isItem(data: unknown): data is Item {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return typeof d.name === 'string' && Array.isArray(d.desc) && typeof d.source === 'string';
}

/** Erzeugt die Item-Aktion; `categoryKey` (Ordner/Kategorie) lenkt den Output. */
export function createItemAction(categoryKey?: string): AiAction<Item> {
  const catHint =
    categoryKey && CATEGORY_LABELS[categoryKey]
      ? `\n\nZielkategorie: **${CATEGORY_LABELS[categoryKey]}** (\`${categoryKey}\`). Wähle eine Basis dieser Kategorie und setze item_type/equipment_category passend.`
      : '';

  return {
    id: 'create-item',
    label: 'Gegenstand per KI anlegen',
    anthropicTools: DND_TOOLS_ANTHROPIC,
    openAiTools: DND_TOOLS_OPENAI,
    execute: executeDndTool,
    jsonSchema: ITEM_SCHEMA,
    validate: isItem,
    buildSystemPrompt() {
      return `Du bist ein Assistent für Dungeons & Dragons (5e). Aus einer deutschen Beschreibung erstellst du einen Gegenstand als JSON, der dem Schema der dnd5eapi.co entspricht.

## Vorgehen
1. Leite aus der Beschreibung den passenden ENGLISCHEN Basis-Gegenstand ab (z.B. „Kriegshammer aus Obsidian“ → Suchbegriff "warhammer").
2. Rufe \`search_dnd_api\` (category "equipment" für gewöhnliche Gegenstände/Waffen/Rüstung, "magic-items" für magische) mit dem englischen Begriff auf und wähle das passendste Ergebnis.
3. Lade es mit \`get_dnd_api_resource\` und übernimm die Spielwerte als Basis (damage, two_handed_damage, properties, range, armor_class, weapon_category, equipment_category, cost, weight, item_type).
4. Ergänze die spezifischen Änderungen aus der Beschreibung: setze \`name\` (englischer Name), \`name_de\` (deutscher Name), \`desc\` (englische Beschreibung) und \`desc_de\` (deutsche Beschreibung). Wenn es ein magischer Gegenstand ist, setze \`rarity\` und ggf. \`attunement\`/\`attunement_by\`.
5. Setze \`source\` immer auf "KI". Übernimm Zahlenwerte (Gewicht, Reichweite) unverändert aus der Basis, soweit die Beschreibung nichts anderes sagt.

Wenn die DnD-API nichts Passendes liefert, baue den Gegenstand plausibel selbst (Homebrew) und lasse \`index\` leer.${catHint}`;
    },
  };
}

/**
 * Erzeugt die Item-Aktion „per KI überarbeiten“: ein BESTEHENDER Gegenstand wird
 * gemäß einer freien Anweisung des Nutzers (z.B. „Inschrift auf Elbisch hinzufügen“)
 * angepasst. Das aktuelle Item-JSON liegt im System-Prompt als Kontext bei.
 */
export function editItemAction(current: Item): AiAction<Item> {
  return {
    id: 'edit-item',
    label: 'Gegenstand per KI überarbeiten',
    anthropicTools: DND_TOOLS_ANTHROPIC,
    openAiTools: DND_TOOLS_OPENAI,
    execute: executeDndTool,
    jsonSchema: ITEM_SCHEMA,
    validate: isItem,
    buildSystemPrompt() {
      return `Du bist ein Assistent für Dungeons & Dragons (5e). Du überarbeitest einen BESTEHENDEN Gegenstand gemäß den Änderungswünschen des Nutzers und gibst das vollständige, aktualisierte Item-JSON (Schema der dnd5eapi.co) aus.

## Aktueller Gegenstand
\`\`\`json
${JSON.stringify(current, null, 2)}
\`\`\`

## Vorgehen
1. Wende AUSSCHLIESSLICH die gewünschten Änderungen an. Alle nicht betroffenen Felder (Spielwerte, Kategorie, Kosten, Gewicht, Quelle …) bleiben UNVERÄNDERT erhalten.
2. Pflege Beschreibungs-Änderungen konsistent in \`desc\` (Englisch) UND \`desc_de\` (Deutsch) ein.
3. Erfordert die Änderung neue Spielwerte oder eine Basis, recherchiere über \`search_dnd_api\` (category "equipment" oder "magic-items") und \`get_dnd_api_resource\`.
4. Wird der Gegenstand dadurch magisch, ergänze \`rarity\` und ggf. \`attunement\`/\`attunement_by\`.
5. Behalte \`source\` unverändert bei, sofern der Nutzer nichts anderes verlangt.
6. Gib IMMER das VOLLSTÄNDIGE Item-JSON aus — nicht nur die geänderten Felder.`;
    },
  };
}
