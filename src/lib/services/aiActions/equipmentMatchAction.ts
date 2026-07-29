/**
 * Bereitet die englische Startausrüstungs-Prosa (Klasse + Hintergrund) für den Wizard
 * als WÄHLBARE, deutsche Optionen auf: je Herkunft eine Gruppe, je Gruppe die Optionen
 * A/B/C (bzw. genau eine, wenn es keine Wahl gibt). Bewusst tool-frei → `runAiAction`
 * nimmt den Single-Call-Pfad; auf QM/vllm heißt guided decoding zugleich
 * `enable_thinking:false`, also KEIN Reasoning-Vorlauf (die Aufgabe ist reines
 * Übersetzen/Zerlegen/Benennen, kein Deuten).
 *
 * Das Gewicht bleibt außen vor — es füllt die Assembly deterministisch aus der
 * Item-Bibliothek. Hier zählt nur die Benennung möglichst nah an den Bibliotheks-Items.
 */
import type { AiAction } from './types';
import {
  equipmentOptionsJsonSchema,
  parseEquipmentOptions,
  type EquipmentOptions,
} from '../../schemas/wizardEquipment';

const EQUIPMENT_OPTIONS_SYSTEM = `You are an assistant for a German Dungeons & Dragons 5e (SRD 5.2 / 2024) character builder.
You receive the starting-equipment text of a level-1 character — usually already GERMAN, occasionally English: the class option text in <class_equipment> and the background equipment in <background_equipment>, plus a list of canonical German library item names in <library_items>.
Turn it into SELECTABLE options in GERMAN, grouped by source, so the player can pick exactly one option per group.

CRITICAL — item naming: when an object's name already appears in GERMAN (in the source text or in <library_items>), use THAT exact name verbatim. NEVER re-translate a German name into another word — e.g. keep "Beil", do not turn it into "Wurfaxt". Only translate names that arrive in English, and then prefer the matching <library_items> spelling.

## Rules
1. groups: one group per NON-EMPTY source. Use source "Klasse" for <class_equipment> and "Hintergrund" for <background_equipment>. Omit a group whose source text is absent.
2. options: the class text usually offers a labelled choice ("Choose A or B: (A) … or (B) 75 GP") → emit ONE option per label. A source that grants a FIXED set with no choice gets exactly ONE option. Never invent options that are not in the text.
3. label: the short German label — the letter ("A"/"B"/"C") when the text uses one, otherwise a short German noun.
4. description: a concise GERMAN sentence naming everything the option grants (items + gold), for the player to read before choosing.
5. items: every concrete OBJECT of THAT option, with a count (default 1). NEVER a coin/money entry — coins belong in goldPieces only (rule 6), never as an item like "15 Goldmünzen". Bundles like "Priester's Pack"/"Explorer's Pack" stay ONE entry with a German name (e.g. "Priesterausrüstung", "Entdeckerausrüstung") — do NOT expand a pack into its contents. Prefer the exact German name from <library_items> when an object clearly matches one; keep names singular and clean (no counts, no parenthetical rules).
6. goldPieces: coins of THAT option converted to gold pieces (GP): 1 PP = 10 GP, 1 EP = 5 GP, 1 SP = 0.1 GP (round down), 1 CP = 0.01 GP (round down). If the option grants no coins, 0. Coins go HERE and nowhere else — never also as an item in "items".
7. German names only. Invent nothing that is not in the source text.`;

export function buildEquipmentOptionsAction(): AiAction<EquipmentOptions> {
  return {
    id: 'wizard-equipment-options',
    label: 'Startausrüstung aufbereiten',
    anthropicTools: [],
    openAiTools: [],
    execute: async () => '',
    jsonSchema: equipmentOptionsJsonSchema,
    validate: (d): d is EquipmentOptions => parseEquipmentOptions(d) !== null,
    buildSystemPrompt: () => EQUIPMENT_OPTIONS_SYSTEM,
  };
}

/** userInput: XML-gegliedert. Fehlende Prosa-Quellen bzw. leere Bibliothek fallen weg. */
export function buildEquipmentOptionsInput(ctx: {
  classProse: string;
  backgroundProse: string;
  libraryItems: string[];
}): string {
  return [
    ctx.classProse.trim() ? `<class_equipment>${ctx.classProse}</class_equipment>` : '',
    ctx.backgroundProse.trim() ? `<background_equipment>${ctx.backgroundProse}</background_equipment>` : '',
    ...(ctx.libraryItems.length ? [`<library_items>${JSON.stringify(ctx.libraryItems)}</library_items>`] : []),
  ]
    .filter(Boolean)
    .join('\n');
}
