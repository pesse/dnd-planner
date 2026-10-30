/**
 * KI-Aktionen für Gegenstände (Anlage / Überarbeitung) als `EntityActionSpec`.
 * Workflow + Boilerplate stecken in factory.ts; hier nur Schema + Prosa.
 */
import type { Item } from '../../types';
import { itemSchema } from '../../schemas/item';
import { toLlmJsonSchema } from '../../schemas/llmJson';
import { parseItem } from '../../utils/schemaValidation';
import { CATEGORY_LABELS } from '../../itemLabels';
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
3. Setze \`source\` immer auf "homebrew-sam", lasse \`key\` und \`index\` leer. Gib IMMER das VOLLSTÄNDIGE Item-JSON aus.${nameHint}${categoryHint}`;
    }
    return `Du bist ein Assistent für Dungeons & Dragons (5e 2024). Aus einer deutschen Beschreibung erstellst du einen Gegenstand als JSON gemäß unserem Item-Schema (angelehnt an Open5e v2).

## Vorgehen
1. Lege die Spielwerte am passenden SRD-5.2-Gegenstand an (z.B. „Kriegshammer aus Obsidian" → Warhammer): damage, two_handed_damage, mastery, properties, range, armor_class, weapon_category, equipment_category, rarity, attunement, cost, weight. \`equipment_category\` (Form \`{index, name}\`) ist die einzige Typ-Quelle.
2. Ergänze die spezifischen Änderungen aus der Beschreibung: setze \`name\` (englischer Name), \`name_de\` (deutscher Name), \`desc\` (englische Beschreibung) und \`desc_de\` (deutsche Beschreibung). Wenn es ein magischer Gegenstand ist, setze \`rarity\` und ggf. \`attunement\`/\`attunement_by\`. Gewährt eine magische Waffe einen Bonus auf Angriff/Schaden (z.B. „+1"), setze \`magic_bonus\` als Zahl (1, 2, 3). \`equipment_category\` bleibt dabei der funktionale Typ — eine magische Waffe behält \`index: "weapon"\`.
3. Setze \`source\` immer auf "homebrew-sam" und lasse \`key\`/\`index\` leer. Übernimm Zahlenwerte (Gewicht, Reichweite) unverändert aus der Basis, soweit die Beschreibung nichts anderes sagt.${nameHint}${categoryHint}`;
  },
  buildEditPrompt({ currentBlock }) {
    return `Du bist ein Assistent für Dungeons & Dragons (5e 2024). Du überarbeitest einen BESTEHENDEN Gegenstand gemäß den Änderungswünschen des Nutzers und gibst das vollständige, aktualisierte Item-JSON (Schema angelehnt an Open5e v2) aus.
${currentBlock}

## Vorgehen
1. Wende AUSSCHLIESSLICH die gewünschten Änderungen an. Alle nicht betroffenen Felder (Spielwerte, Kategorie, Kosten, Gewicht, Quelle …) bleiben UNVERÄNDERT erhalten.
2. Pflege Beschreibungs-Änderungen konsistent in \`desc\` (Englisch) UND \`desc_de\` (Deutsch) ein.
3. Wird der Gegenstand dadurch magisch, ergänze \`rarity\` und ggf. \`attunement\`/\`attunement_by\`. Gewährt er einen Angriffs-/Schadensbonus (z.B. „+1"), setze \`magic_bonus\` als Zahl. \`equipment_category\` bleibt unverändert der funktionale Typ — eine Waffe, die magisch wird, behält \`index: "weapon"\`.
4. Behalte \`source\` unverändert bei, sofern der Nutzer nichts anderes verlangt.
5. Gib IMMER das VOLLSTÄNDIGE Item-JSON aus — nicht nur die geänderten Felder.`;
  },
};

/** Bestehende API: „Gegenstand per KI anlegen". */
export const createItemAction = (opts: CreateActionOptions<Item> = {}) => buildCreateAction(itemSpec, opts);
/** Bestehende API: „Gegenstand per KI überarbeiten". */
export const editItemAction = (current: Item) => buildEditAction(itemSpec, current);
