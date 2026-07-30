/**
 * KI-Aktionen für Zauber (Anlage / Überarbeitung) als `EntityActionSpec`.
 * Workflow + Boilerplate stecken in factory.ts; hier nur Schema + Prosa.
 */
import type { Spell } from '../../types';
import { spellSchema } from '../../schemas/spell';
import { toLlmJsonSchema } from '../../schemas/shared';
import { parseSpell } from '../../utils/schemaValidation';
import { buildCreateAction, buildEditAction, type CreateActionOptions } from './factory';
import type { EntityActionSpec } from './spec';
import {
  OPEN5E_SPELL_TOOLS_ANTHROPIC,
  OPEN5E_SPELL_TOOLS_OPENAI,
  executeOpen5eSpellTool,
} from '../open5eSpellTools';

export function isSpell(data: unknown): data is Spell {
  return parseSpell(data).ok;
}

const spellSpec: EntityActionSpec<Spell> = {
  entity: 'spell',
  nounDe: 'Zauber',
  currentHeading: 'Aktueller Zauber',
  jsonSchema: toLlmJsonSchema(spellSchema),
  validate: isSpell,
  anthropicTools: OPEN5E_SPELL_TOOLS_ANTHROPIC,
  openAiTools: OPEN5E_SPELL_TOOLS_OPENAI,
  execute: executeOpen5eSpellTool,
  buildCreatePrompt({ templateBlock, nameHint }) {
    if (templateBlock) {
      return `Du bist ein Assistent für Dungeons & Dragons (5e). Du erstellst aus einer Vorlage und den Wünschen des Nutzers einen Zauber als JSON im App-Schema.
${templateBlock}

## Vorgehen
1. Nutze die Vorlage als Basis; wende die Wünsche des Nutzers an.
2. Die Open5e-Zauber-Tools (\`search_open5e_spells\`, \`get_open5e_spell\`, SRD 5.2) nur bei fehlenden Referenzwerten nutzen.
3. \`school\` ist ein englischer Schlüssel, \`level\` 0–9.
4. Setze \`source\` immer auf "homebrew-sam" — auch wenn die Vorlage aus dem SRD stammt. Gib IMMER das VOLLSTÄNDIGE Spell-JSON aus.${nameHint}`;
    }
    return `Du bist ein Assistent für Dungeons & Dragons (5e). Aus einer Beschreibung erstellst du einen Zauber als JSON im App-Schema.

## Vorgehen
1. Gibt es einen passenden SRD-Zauber, suche ihn mit \`search_open5e_spells\` (englischer Begriff) und lade ihn mit \`get_open5e_spell\` als Basis.
2. Andernfalls baue den Zauber plausibel selbst mit konsistenten Werten.
3. \`school\` ist ein englischer Schlüssel, \`level\` 0–9.
4. Setze \`source\` auf "srd-2024", wenn du einen SRD-Zauber unverändert übernimmst — sonst immer auf "homebrew-sam".
5. Gib IMMER das VOLLSTÄNDIGE Spell-JSON gemäß Schema aus.${nameHint}`;
  },
  buildEditPrompt({ currentBlock }) {
    return `Du bist ein Assistent für Dungeons & Dragons (5e). Du überarbeitest einen BESTEHENDEN Zauber gemäß den Änderungswünschen des Nutzers und gibst das vollständige, aktualisierte Spell-JSON im App-Schema aus.
${currentBlock}

## Vorgehen
1. Wende AUSSCHLIESSLICH die gewünschten Änderungen an. Alle nicht betroffenen Felder bleiben UNVERÄNDERT erhalten.
2. Pflege Beschreibungs-Änderungen konsistent in \`desc\` (Original) und – falls vorhanden – \`desc_de\` (Deutsch) ein.
3. \`school\` bleibt ein englischer Schlüssel; \`level\` 0–9. \`source\` bleibt unverändert.
4. Gib IMMER das VOLLSTÄNDIGE Spell-JSON aus — nicht nur die geänderten Felder.`;
  },
};

/** Bestehende API: „Zauber per KI anlegen". */
export const createSpellAction = (opts: CreateActionOptions<Spell> = {}) => buildCreateAction(spellSpec, opts);
/** Bestehende API: „Zauber per KI überarbeiten". */
export const editSpellAction = (current: Spell) => buildEditAction(spellSpec, current);
