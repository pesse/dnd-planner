/**
 * KI-Aktionen für Gegenstände (Anlage / Überarbeitung) als `EntityActionSpec`.
 * Workflow + Boilerplate stecken in factory.ts; hier nur Schema + Prosa.
 */
import type { Item } from '../../types';
import { itemSchema } from '../../schemas/item';
import { toLlmJsonSchema } from '../../schemas/shared';
import { parseItem } from '../../utils/schemaValidation';
import { CATEGORY_LABELS } from '../../itemLibrary';
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
      ? `\n\nZielkategorie: **${CATEGORY_LABELS[key]}** (\`${key}\`). Wähle eine Basis dieser Kategorie und setze item_type/equipment_category passend.`
      : '',
  buildCreatePrompt({ templateBlock, nameHint, categoryHint }) {
    if (templateBlock) {
      return `Du bist ein Assistent für Dungeons & Dragons (5e). Du erstellst aus einer Vorlage und den Wünschen des Nutzers einen Gegenstand als JSON, der dem Schema der dnd5eapi.co entspricht.
${templateBlock}

## Vorgehen
1. Nutze die Vorlage als Basis und übernimm ihre Spielwerte, solange die Beschreibung nichts anderes verlangt.
2. Wende die Wünsche des Nutzers an: passe \`name\`, \`name_de\`, \`desc\` (Englisch), \`desc_de\` (Deutsch) und betroffene Spielwerte an. Wird der Gegenstand magisch, ergänze \`rarity\` und ggf. \`attunement\`/\`attunement_by\`; ein Angriffs-/Schadensbonus (z.B. „+1") gehört als Zahl in \`magic_bonus\`.
3. Die DnD-API-Tools (\`search_dnd_api\`, \`get_dnd_api_resource\`) stehen bereit — nutze sie NUR, wenn dir Referenzwerte fehlen, die die Vorlage nicht abdeckt. Bei einer vollständigen Vorlage ist keine API-Abfrage nötig.
4. Setze \`source\` immer auf "KI" und lasse \`index\` leer. Gib IMMER das VOLLSTÄNDIGE Item-JSON aus.${nameHint}${categoryHint}`;
    }
    return `Du bist ein Assistent für Dungeons & Dragons (5e). Aus einer deutschen Beschreibung erstellst du einen Gegenstand als JSON, der dem Schema der dnd5eapi.co entspricht.

## Vorgehen
1. Leite aus der Beschreibung den passenden ENGLISCHEN Basis-Gegenstand ab (z.B. „Kriegshammer aus Obsidian" → Suchbegriff "warhammer").
2. Rufe \`search_dnd_api\` (category "equipment" für gewöhnliche Gegenstände/Waffen/Rüstung, "magic-items" für magische) mit dem englischen Begriff auf und wähle das passendste Ergebnis.
3. Lade es mit \`get_dnd_api_resource\` und übernimm die Spielwerte als Basis (damage, two_handed_damage, properties, range, armor_class, weapon_category, equipment_category, cost, weight, item_type).
4. Ergänze die spezifischen Änderungen aus der Beschreibung: setze \`name\` (englischer Name), \`name_de\` (deutscher Name), \`desc\` (englische Beschreibung) und \`desc_de\` (deutsche Beschreibung). Wenn es ein magischer Gegenstand ist, setze \`rarity\` und ggf. \`attunement\`/\`attunement_by\`. Gewährt eine magische Waffe einen Bonus auf Angriff/Schaden (z.B. „+1"), setze \`magic_bonus\` als Zahl (1, 2, 3).
5. Setze \`source\` immer auf "KI". Übernimm Zahlenwerte (Gewicht, Reichweite) unverändert aus der Basis, soweit die Beschreibung nichts anderes sagt.

Wenn die DnD-API nichts Passendes liefert, baue den Gegenstand plausibel selbst (Homebrew) und lasse \`index\` leer.${nameHint}${categoryHint}`;
  },
  buildEditPrompt({ currentBlock }) {
    return `Du bist ein Assistent für Dungeons & Dragons (5e). Du überarbeitest einen BESTEHENDEN Gegenstand gemäß den Änderungswünschen des Nutzers und gibst das vollständige, aktualisierte Item-JSON (Schema der dnd5eapi.co) aus.
${currentBlock}

## Vorgehen
1. Wende AUSSCHLIESSLICH die gewünschten Änderungen an. Alle nicht betroffenen Felder (Spielwerte, Kategorie, Kosten, Gewicht, Quelle …) bleiben UNVERÄNDERT erhalten.
2. Pflege Beschreibungs-Änderungen konsistent in \`desc\` (Englisch) UND \`desc_de\` (Deutsch) ein.
3. Erfordert die Änderung neue Spielwerte oder eine Basis, recherchiere über \`search_dnd_api\` (category "equipment" oder "magic-items") und \`get_dnd_api_resource\`.
4. Wird der Gegenstand dadurch magisch, ergänze \`rarity\` und ggf. \`attunement\`/\`attunement_by\`. Gewährt er einen Angriffs-/Schadensbonus (z.B. „+1"), setze \`magic_bonus\` als Zahl.
5. Behalte \`source\` unverändert bei, sofern der Nutzer nichts anderes verlangt.
6. Gib IMMER das VOLLSTÄNDIGE Item-JSON aus — nicht nur die geänderten Felder.`;
  },
};

/** Bestehende API: „Gegenstand per KI anlegen". */
export const createItemAction = (opts: CreateActionOptions<Item> = {}) => buildCreateAction(itemSpec, opts);
/** Bestehende API: „Gegenstand per KI überarbeiten". */
export const editItemAction = (current: Item) => buildEditAction(itemSpec, current);
