/**
 * KI-Aktionen für Charaktere (Erstellung / Stufenaufstieg) als `EntityActionSpec`.
 * Workflow + Boilerplate stecken in factory.ts; hier nur Schema + Prosa.
 *
 * Anders als Monster/Zauber sind die Charakter-Aktionen TOOL-FREI: die Regel-
 * Genauigkeit (Klassenmerkmale, Zauberplätze, Übungsbonus) kommt über einen
 * vorab injizierten SRD-Regelblock (siehe services/characterRules.ts), nicht über
 * einen Agent-Loop. So bleibt es bei EINEM KI-Call (TPM-schonend).
 */
import type { Character } from '../../schemas/character';
import { characterSchema } from '../../schemas/character';
import { toLlmJsonSchema } from '../../schemas/shared';
import { parseCharacter } from '../../utils/schemaValidation';
import { buildCreateAction, buildEditAction } from './factory';
import type { AiAction } from './types';
import type { EntityActionSpec } from './spec';

export function isCharacter(data: unknown): data is Character {
  return parseCharacter(data).ok;
}

/** Hängt einen vorab gebauten Regelblock an den System-Prompt der Aktion an. */
function appendSystem<T>(action: AiAction<T>, block: string): AiAction<T> {
  if (!block) return action;
  const base = action.buildSystemPrompt;
  return { ...action, buildSystemPrompt: () => base() + block };
}

const MECHANICS = `

## Spielmechanik (konsistent halten)
- Attributsmodifikator = abrunden((Wert − 10) / 2); \`strMod\`…\`chaMod\` entsprechend setzen.
- \`proficiencyBonus\` = 2 + abrunden((Gesamtstufe − 1) / 4).
- Fertigkeiten (\`skills\`, Schlüssel = deutscher Fertigkeitsname): \`value\` = zugehöriger
  Attributsmodifikator (+ Übungsbonus wenn \`prof\`, + doppelter Übungsbonus wenn \`exp\`).
- \`passivePerception\` = 10 + WEI-Mod (+ Übungsbonus, falls in Wahrnehmung geübt).
- Trefferpunkte: Stufe 1 = max. Trefferwürfel + KON-Mod; je weitere Stufe Durchschnitts-
  wert des Trefferwürfels (aufgerundet) + KON-Mod. \`hitDice\` als "AnzWXX" (z.B. "4W10").
- Zauberplätze (\`spells.slots\`, Index 0 = Grad 1 … Index 8 = Grad 9) und Zaubertricks
  gemäß Klassen-/Stufentabelle des SRD. Nicht-Zauberer: alle \`total\` = 0.
- Beschreibende Texte auf Deutsch.`;

const characterSpec: EntityActionSpec<Character> = {
  entity: 'character',
  nounDe: 'Charakter',
  currentHeading: 'Aktueller Charakter',
  jsonSchema: toLlmJsonSchema(characterSchema),
  validate: isCharacter,
  buildCreatePrompt({ nameHint }) {
    return `Du bist ein Assistent für Dungeons & Dragons (5e). Aus der Beschreibung des Nutzers erstellst du einen VOLLSTÄNDIGEN Spielercharakter als JSON im App-Schema (Deutsch).

## Vorgehen
1. Leite Rasse, Klasse(n) + Stufe(n), Hintergrund und Attribute aus der Beschreibung ab; fehlt etwas, wähle spielmechanisch sinnvolle Werte (Standard-Wertereihe 15/14/13/12/10/8, passend zur Klasse verteilt).
2. Fülle \`classLevel\` als lesbaren Text (z.B. "Waldläufer 3"), \`race\`, \`background\`.
3. Berechne ALLE abgeleiteten Werte konsistent (siehe Spielmechanik) — auch Rettungswurf-Profizienzen, Angriffe, Klassenmerkmale (\`classFeatures\`), Startausrüstung/Inventar und ggf. Zauber.
4. Nutze die beigelegten SRD-Regeln als Quelle für Klassenmerkmale und Zauberplätze.
5. Gib IMMER das VOLLSTÄNDIGE Charakter-JSON gemäß Schema aus.${nameHint}${MECHANICS}`;
  },
  buildEditPrompt({ currentBlock }) {
    return `Du bist ein Assistent für Dungeons & Dragons (5e). Du führst für einen BESTEHENDEN Charakter einen STUFENAUFSTIEG durch und gibst das vollständige, aktualisierte Charakter-JSON im App-Schema (Deutsch) aus.
${currentBlock}

## Vorgehen
1. Erhöhe die Stufe in \`classLevel\` gemäß Wunsch des Nutzers (Standard: +1; bei Multiclassing die genannte Klasse).
2. Aktualisiere alle stufenabhängigen Werte: \`proficiencyBonus\`, \`hpMax\`, \`hitDice\`, neue Einträge in \`classFeatures\`, \`spells.slots\`/\`cantrips\` sowie davon abgeleitete Werte (Fertigkeiten, Rettungswürfe, passive Wahrnehmung).
3. Ergänze NUR die durch den Aufstieg hinzukommenden Merkmale; alle nicht betroffenen Felder bleiben UNVERÄNDERT erhalten (auch \`hpCurrent\`, Inventar, Persönlichkeit, Metadaten).
4. Nutze die beigelegten SRD-Regeln als Quelle für die neuen Klassenmerkmale und Zauberplätze.
5. Gib IMMER das VOLLSTÄNDIGE Charakter-JSON aus — nicht nur die geänderten Felder.${MECHANICS}`;
  },
};

/** „Charakter per KI anlegen" — tool-frei, mit vorab injiziertem SRD-Regelblock. */
export const createCharacterAction = (rulesBlock = ''): AiAction<Character> =>
  appendSystem(buildCreateAction(characterSpec, { withDndTools: false }), rulesBlock);

/** „Charakter per KI aufstufen" — tool-frei, mit vorab injiziertem SRD-Regelblock. */
export const editCharacterAction = (current: Character, rulesBlock = ''): AiAction<Character> =>
  appendSystem(buildEditAction(characterSpec, current, { withDndTools: false }), rulesBlock);
