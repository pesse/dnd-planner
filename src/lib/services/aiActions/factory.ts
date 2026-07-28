/**
 * Baut aus einem `EntityActionSpec` die konkreten `AiAction`s für Anlage und
 * Überarbeitung. Hier lebt der gemeinsame Create/Edit-Workflow: AiAction-Boilerplate,
 * DnD-API-Tool-Anbindung, JSON-Kontextblöcke und Namens-/Kategorie-Hinweise.
 */
import { DND_TOOLS_ANTHROPIC, DND_TOOLS_OPENAI, executeDndTool } from '../dndApiTools';
import type { AiAction } from './types';
import type { EntityActionSpec, PromptParts } from './spec';

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

function baseAction<T>(
  spec: EntityActionSpec<T>,
  withDndTools = true,
): Omit<AiAction<T>, 'id' | 'label' | 'buildSystemPrompt'> {
  // Entity-eigene Tools (z.B. Open5e-Items) haben Vorrang; sonst die DnD-API-Tools.
  const custom = spec.execute !== undefined;
  return {
    anthropicTools: !withDndTools ? [] : custom ? (spec.anthropicTools ?? []) : DND_TOOLS_ANTHROPIC,
    openAiTools: !withDndTools ? [] : custom ? (spec.openAiTools ?? []) : DND_TOOLS_OPENAI,
    execute: !withDndTools ? async () => '' : custom ? spec.execute! : executeDndTool,
    jsonSchema: spec.jsonSchema,
    validate: spec.validate,
  };
}

/** „<Noun> per KI anlegen" — mit optionaler Vorlage und DnD-API-Recherche. */
export function buildCreateAction<T>(spec: EntityActionSpec<T>, opts: CreateActionOptions<T> = {}): AiAction<T> {
  const parts: PromptParts = {
    templateBlock: opts.template ? jsonBlock('Vorlage (Ausgangspunkt)', opts.template) : '',
    currentBlock: '',
    nameHint: opts.name ? (spec.nameHint ?? defaultNameHint)(opts.name) : '',
    categoryHint: spec.categoryHint && opts.categoryKey ? spec.categoryHint(opts.categoryKey) : '',
  };
  return {
    ...baseAction(spec, opts.withDndTools ?? true),
    id: `create-${spec.entity}`,
    label: `${spec.nounDe} per KI anlegen`,
    buildSystemPrompt: () => spec.buildCreatePrompt(parts),
  };
}

/** „<Noun> per KI überarbeiten" — der aktuelle Stand liegt als Kontext bei. */
export function buildEditAction<T>(spec: EntityActionSpec<T>, current: T): AiAction<T> {
  const parts: PromptParts = {
    templateBlock: '',
    currentBlock: jsonBlock(spec.currentHeading, current),
    nameHint: '',
    categoryHint: '',
  };
  return {
    ...baseAction(spec),
    id: `edit-${spec.entity}`,
    label: `${spec.nounDe} per KI überarbeiten`,
    buildSystemPrompt: () => spec.buildEditPrompt(parts),
  };
}
