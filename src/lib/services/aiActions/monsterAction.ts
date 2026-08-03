/**
 * KI-Aktionen für Monster (Anlage / Überarbeitung) als `EntityActionSpec`.
 * Workflow + Boilerplate stecken in factory.ts; hier nur Schema + Prosa.
 */
import type { Monster } from '../../types';
import { monsterSchema } from '../../schemas/monster';
import { toLlmJsonSchema } from '../../schemas/llmJson';
import { parseMonster } from '../../utils/schemaValidation';
import { buildCreateAction, buildEditAction, type CreateActionOptions } from './factory';
import type { EntityActionSpec } from './spec';

export function isMonster(data: unknown): data is Monster {
  return parseMonster(data).ok;
}

const monsterSpec: EntityActionSpec<Monster> = {
  entity: 'monster',
  nounDe: 'Monster',
  currentHeading: 'Aktuelles Monster',
  jsonSchema: toLlmJsonSchema(monsterSchema),
  validate: isMonster,
  buildCreatePrompt({ templateBlock, nameHint }) {
    if (templateBlock) {
      return `Du bist ein Assistent für Dungeons & Dragons (5e). Du erstellst aus einer Vorlage und den Wünschen des Nutzers einen Monster-Statblock als JSON im App-Schema.
${templateBlock}

## Vorgehen
1. Nutze die Vorlage als Basis und übernimm ihre Werte, solange die Beschreibung nichts anderes verlangt.
2. Wende die Wünsche des Nutzers an und halte die Werte spielmechanisch konsistent (cr/xp passend zu HP, AC, Schaden).
3. Die DnD-API-Tools (category "monsters") stehen bereit — nutze sie NUR, wenn dir Referenzwerte fehlen.
4. \`type\`/\`alignment\` sind englische Schlüssel; beschreibende Texte auf Deutsch.
5. Setze \`source\` immer auf "homebrew-sam" — auch wenn die Vorlage aus dem SRD stammt. Gib IMMER das VOLLSTÄNDIGE Monster-JSON aus.${nameHint}`;
    }
    return `Du bist ein Assistent für Dungeons & Dragons (5e). Aus einer Beschreibung erstellst du einen Monster-Statblock als JSON im App-Schema.

## Vorgehen
1. Gibt es ein passendes SRD-Monster, suche es mit \`search_dnd_api\` (category "monsters", englischer Begriff) und lade es mit \`get_dnd_api_resource\` als Basis.
2. Andernfalls baue das Monster plausibel selbst (Homebrew) mit konsistenten Werten (cr/xp passend zu HP, AC, Schaden).
3. \`type\`/\`alignment\` sind englische Schlüssel; beschreibende Texte (Aktionen, Eigenschaften) auf Deutsch.
4. Setze \`source\` auf "srd-2024", wenn du ein SRD-Monster unverändert übernimmst — sonst immer auf "homebrew-sam".
5. Gib IMMER das VOLLSTÄNDIGE Monster-JSON gemäß Schema aus.${nameHint}`;
  },
  buildEditPrompt({ currentBlock }) {
    return `Du bist ein Assistent für Dungeons & Dragons (5e). Du überarbeitest einen BESTEHENDEN Monster-Statblock gemäß den Änderungswünschen des Nutzers und gibst das vollständige, aktualisierte Monster-JSON im App-Schema (Deutsch) aus.
${currentBlock}

## Vorgehen
1. Wende AUSSCHLIESSLICH die gewünschten Änderungen an. Alle nicht betroffenen Felder bleiben UNVERÄNDERT erhalten.
2. Halte die Werte spielmechanisch konsistent (z.B. passt der Herausforderungsgrad \`cr\`/\`xp\` zu HP, AC und Schaden).
3. Beschreibungen/Aktionstexte auf Deutsch. \`type\` und \`alignment\` bleiben englische Schlüssel. \`source\` bleibt unverändert.
4. Gib IMMER das VOLLSTÄNDIGE Monster-JSON aus — nicht nur die geänderten Felder.`;
  },
};

/** Bestehende API: „Monster per KI anlegen". */
export const createMonsterAction = (opts: CreateActionOptions<Monster> = {}) => buildCreateAction(monsterSpec, opts);
/** Bestehende API: „Monster per KI überarbeiten". */
export const editMonsterAction = (current: Monster) => buildEditAction(monsterSpec, current);
