/**
 * Baut aus einem `EntityActionSpec` die konkreten `AiAction`s für Anlage und
 * Überarbeitung: DnD-API-Tool-Anbindung, JSON-Kontextblöcke, Namens-/Kategorie-Hinweise.
 */
import { DND_TOOLS_ANTHROPIC, DND_TOOLS_OPENAI, executeDndTool } from '../dndApiTools';
import type { AiAction } from './types';
import { assembleAction, NO_TOOLS, type ActionTools, type EntityActionSpec, type PromptParts } from './spec';

export interface CreateActionOptions<T> {
  /** Bestehender Datensatz als Vorlage; macht die DnD-API-Recherche optional. */
  template?: T;
  /** Vom Nutzer gewünschter Name. */
  name?: string;
  /** Ziel-Kategorie (nur Item) — lenkt Basis-Wahl und equipment_category. */
  categoryKey?: string;
  /** DnD-API-Tools anbinden (Default true). `false` → tool-freie Action: der Runner
   *  generiert in EINEM Call statt im Agent-Loop (deutlich weniger Tokens). */
  withDndTools?: boolean;
}

const jsonBlock = (heading: string, data: unknown): string =>
  `\n\n## ${heading}\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;

const defaultNameHint = (name: string): string => `\n\nGewünschter Name: **„${name}"**.`;

function entityTools<T>(spec: EntityActionSpec<T>, withDndTools: boolean): ActionTools {
  if (!withDndTools) return NO_TOOLS;
  // Entity-eigene Tools (z.B. Open5e-Items) haben Vorrang; sonst die DnD-API-Tools.
  return spec.execute !== undefined
    ? { anthropicTools: spec.anthropicTools ?? [], openAiTools: spec.openAiTools ?? [], execute: spec.execute }
    : { anthropicTools: DND_TOOLS_ANTHROPIC, openAiTools: DND_TOOLS_OPENAI, execute: executeDndTool };
}

/** „<Noun> per KI anlegen" — mit optionaler Vorlage und DnD-API-Recherche. */
export function buildCreateAction<T>(spec: EntityActionSpec<T>, opts: CreateActionOptions<T> = {}): AiAction<T> {
  const parts: PromptParts = {
    templateBlock: opts.template ? jsonBlock('Vorlage (Ausgangspunkt)', opts.template) : '',
    currentBlock: '',
    nameHint: opts.name ? (spec.nameHint ?? defaultNameHint)(opts.name) : '',
    categoryHint: spec.categoryHint && opts.categoryKey ? spec.categoryHint(opts.categoryKey) : '',
  };
  return assembleAction(
    spec,
    { id: 'create', label: 'per KI anlegen' },
    entityTools(spec, opts.withDndTools ?? true),
    () => spec.buildCreatePrompt(parts),
  );
}

/** „<Noun> per KI überarbeiten" — der aktuelle Stand liegt als Kontext bei. */
export function buildEditAction<T>(spec: EntityActionSpec<T>, current: T): AiAction<T> {
  const parts: PromptParts = {
    templateBlock: '',
    currentBlock: jsonBlock(spec.currentHeading, current),
    nameHint: '',
    categoryHint: '',
  };
  return assembleAction(
    spec,
    { id: 'edit', label: 'per KI überarbeiten' },
    entityTools(spec, true),
    () => spec.buildEditPrompt(parts),
  );
}
