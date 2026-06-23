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
  /** Ziel-Kategorie (nur Item) — lenkt Basis-Wahl und item_type/equipment_category. */
  categoryKey?: string;
}

const jsonBlock = (heading: string, data: unknown): string =>
  `\n\n## ${heading}\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;

const defaultNameHint = (name: string): string => `\n\nGewünschter Name: **„${name}"**.`;

function baseAction<T>(spec: EntityActionSpec<T>): Omit<AiAction<T>, 'id' | 'label' | 'buildSystemPrompt'> {
  return {
    anthropicTools: DND_TOOLS_ANTHROPIC,
    openAiTools: DND_TOOLS_OPENAI,
    execute: executeDndTool,
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
    ...baseAction(spec),
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
