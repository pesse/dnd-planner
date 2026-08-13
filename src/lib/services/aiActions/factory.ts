/**
 * Baut aus einem `EntityActionSpec` die konkreten `AiAction`s für Anlage und
 * Überarbeitung: Tool-Anbindung, JSON-Kontextblöcke, Namens-/Kategorie-Hinweise.
 */
import type { AiAction } from './types';
import { assembleAction, NO_TOOLS, type ActionTools, type EntityActionSpec, type PromptParts } from './spec';

export interface CreateActionOptions<T> {
  /** Bestehender Datensatz als Vorlage; macht Recherche optional. */
  template?: T;
  /** Vom Nutzer gewünschter Name. */
  name?: string;
  /** Ziel-Kategorie (nur Item) — lenkt Basis-Wahl und equipment_category. */
  categoryKey?: string;
}

const jsonBlock = (heading: string, data: unknown): string =>
  `\n\n## ${heading}\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;

const defaultNameHint = (name: string): string => `\n\nGewünschter Name: **„${name}"**.`;

/** Ohne eigene Tools bleibt die Aktion tool-frei — ein Call statt Agent-Loop. */
function entityTools<T>(spec: EntityActionSpec<T>): ActionTools {
  if (spec.execute === undefined) return NO_TOOLS;
  return { anthropicTools: spec.anthropicTools ?? [], openAiTools: spec.openAiTools ?? [], execute: spec.execute };
}

/** „<Noun> per KI anlegen" — mit optionaler Vorlage. */
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
    entityTools(spec),
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
    entityTools(spec),
    () => spec.buildEditPrompt(parts),
  );
}
