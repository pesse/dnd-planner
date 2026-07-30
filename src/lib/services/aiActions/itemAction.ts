/**
 * KI-Aktionen für Gegenstände (Anlage / Überarbeitung) als `EntityActionSpec`.
 * Workflow + Boilerplate stecken in factory.ts; hier nur Schema + Prosa.
 */
import type { Item } from '../../types';
import { itemSchema } from '../../schemas/item';
import { toLlmJsonSchema } from '../../schemas/shared';
import { parseItem } from '../../utils/schemaValidation';
import { CATEGORY_LABELS } from '../../itemLibrary';
import { OPEN5E_ITEM_TOOLS_ANTHROPIC, OPEN5E_ITEM_TOOLS_OPENAI, executeOpen5eItemTool } from '../open5eItemTools';
import { buildCreateAction, buildEditAction, type CreateActionOptions } from './factory';
import type { EntityActionSpec } from './spec';

export function isItem(data: unknown): data is Item {
  return parseItem(data).ok;
}

const itemSpec: EntityActionSpec<Item> = {
  entity: 'item',
  nounDe: 'Gegenstand',
  currentHeading: 'Aktueller Gegenstand',
  jsonSchema: toLlmJsonSchema(itemSchema),
  validate: isItem,
  anthropicTools: OPEN5E_ITEM_TOOLS_ANTHROPIC,
  openAiTools: OPEN5E_ITEM_TOOLS_OPENAI,
  execute: executeOpen5eItemTool,
  nameHint: (name) =>
    `\n\nGewünschter Name: **„${name}"** — verwende ihn als \`name_de\` und leite einen passenden englischen \`name\` ab.`,
  categoryHint: (key) =>
    CATEGORY_LABELS[key]
      ? `\n\nZielkategorie: **${CATEGORY_LABELS[key]}** (\`${key}\`). Wähle eine Basis dieser Kategorie und setze \`equipment_category\` auf \`{ "index": "${key}", "name": … }\`.`
      : '',
  buildCreatePrompt({ templateBlock, nameHint, categoryHint }) {
    if (templateBlock) {
      return `Du bist ein Assistent für Dungeons & Dragons (5e 2024). Du erstellst aus einer Vorlage und den Wünschen des Nutzers einen Gegenstand als JSON gemäß unserem Item-Schema (angelehnt an Open5e v2).
${templateBlock}

## Vorgehen
1. Nutze die Vorlage als Basis und übernimm ihre Spielwerte, solange die Beschreibung nichts anderes verlangt.
2. Wende die Wünsche des Nutzers an: passe \`name\`, \`name_de\`, \`desc\` (Englisch), \`desc_de\` (Deutsch) und betroffene Spielwerte an. Wird der Gegenstand magisch, ergänze \`rarity\` und ggf. \`attunement\`/\`attunement_by\`; ein Angriffs-/Schadensbonus (z.B. „+1") gehört als Zahl in \`magic_bonus\`. \`equipment_category\` bleibt der FUNKTIONALE Typ — eine magische Waffe behält \`equipment_category.index: "weapon"\`, NICHT "wondrous-item".
3. Die Open5e-Item-Tools (\`search_open5e_items\`, \`get_open5e_item\`) liefern gewöhnliche Ausrüstung UND magische Gegenstände (SRD 5.2) — nutze sie nur, wenn dir Referenzwerte fehlen, die die Vorlage nicht abdeckt. Bei einer vollständigen Vorlage ist keine API-Abfrage nötig.
4. Setze \`source\` immer auf "homebrew-sam", lasse \`key\` und \`index\` leer. Gib IMMER das VOLLSTÄNDIGE Item-JSON aus.${nameHint}${categoryHint}`;
    }
    return `Du bist ein Assistent für Dungeons & Dragons (5e 2024). Aus einer deutschen Beschreibung erstellst du einen Gegenstand als JSON gemäß unserem Item-Schema (angelehnt an Open5e v2).

## Vorgehen
1. Leite aus der Beschreibung den passenden ENGLISCHEN Suchbegriff ab (z.B. „Kriegshammer aus Obsidian" → "warhammer", „Flammenzungen-Langschwert" → "flame tongue").
2. Rufe \`search_open5e_items\` mit dem englischen Begriff auf. Die Suche deckt gewöhnliche Ausrüstung UND magische Gegenstände (SRD 5.2) ab — wähle das passendste Ergebnis (Feld \`tag\`: "ausrüstung" | "magisch").
3. Lade es mit \`get_open5e_item\` und übernimm die Spielwerte als Basis (damage, two_handed_damage, mastery, properties, range, armor_class, weapon_category, equipment_category, rarity, attunement, cost, weight). \`equipment_category\` (Form \`{index, name}\`) ist die einzige Typ-Quelle — übernimm sie unverändert aus der Basis.
4. Ergänze die spezifischen Änderungen aus der Beschreibung: setze \`name\` (englischer Name), \`name_de\` (deutscher Name), \`desc\` (englische Beschreibung) und \`desc_de\` (deutsche Beschreibung). Wenn es ein magischer Gegenstand ist, setze \`rarity\` und ggf. \`attunement\`/\`attunement_by\`. Gewährt eine magische Waffe einen Bonus auf Angriff/Schaden (z.B. „+1"), setze \`magic_bonus\` als Zahl (1, 2, 3). \`equipment_category\` bleibt dabei der funktionale Typ — eine magische Waffe behält \`index: "weapon"\`.
5. Setze \`source\` immer auf "homebrew-sam". Übernimm Zahlenwerte (Gewicht, Reichweite) unverändert aus der Basis, soweit die Beschreibung nichts anderes sagt.

Findet die API nichts Passendes, baue den Gegenstand plausibel selbst (Homebrew) und lasse \`key\`/\`index\` leer.${nameHint}${categoryHint}`;
  },
  buildEditPrompt({ currentBlock }) {
    return `Du bist ein Assistent für Dungeons & Dragons (5e 2024). Du überarbeitest einen BESTEHENDEN Gegenstand gemäß den Änderungswünschen des Nutzers und gibst das vollständige, aktualisierte Item-JSON (Schema angelehnt an Open5e v2) aus.
${currentBlock}

## Vorgehen
1. Wende AUSSCHLIESSLICH die gewünschten Änderungen an. Alle nicht betroffenen Felder (Spielwerte, Kategorie, Kosten, Gewicht, Quelle …) bleiben UNVERÄNDERT erhalten.
2. Pflege Beschreibungs-Änderungen konsistent in \`desc\` (Englisch) UND \`desc_de\` (Deutsch) ein.
3. Erfordert die Änderung neue Spielwerte oder eine Basis, recherchiere über \`search_open5e_items\` und \`get_open5e_item\` (deckt gewöhnliche Ausrüstung UND magische Gegenstände ab).
4. Wird der Gegenstand dadurch magisch, ergänze \`rarity\` und ggf. \`attunement\`/\`attunement_by\`. Gewährt er einen Angriffs-/Schadensbonus (z.B. „+1"), setze \`magic_bonus\` als Zahl. \`equipment_category\` bleibt unverändert der funktionale Typ — eine Waffe, die magisch wird, behält \`index: "weapon"\`.
5. Behalte \`source\` unverändert bei, sofern der Nutzer nichts anderes verlangt.
6. Gib IMMER das VOLLSTÄNDIGE Item-JSON aus — nicht nur die geänderten Felder.`;
  },
};

/** Bestehende API: „Gegenstand per KI anlegen". */
export const createItemAction = (opts: CreateActionOptions<Item> = {}) => buildCreateAction(itemSpec, opts);
/** Bestehende API: „Gegenstand per KI überarbeiten". */
export const editItemAction = (current: Item) => buildEditAction(itemSpec, current);
