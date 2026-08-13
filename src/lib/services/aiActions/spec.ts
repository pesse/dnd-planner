/**
 * Das gemeinsame Gerüst jeder KI-Aktion — Kennung, Label, Schema, Werkzeuge — und die
 * Beschreibung dessen, was eine Entität daran ändert. Anlage/Überarbeitung setzt
 * factory.ts darauf, die Übersetzung translateAction.ts.
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { AiAction } from './types';

export interface ActionSpec<T> {
  entity: string; // 'item' | 'monster' | 'spell' | …
  nounDe: string; // fürs Label: „Gegenstand"
  jsonSchema: object;
  validate: (data: unknown) => data is T;
}

/**
 * Recherche-Werkzeuge einer Aktion. Die drei gehören zusammen — eines allein zu setzen
 * lässt den Tool-Loop ins Leere laufen.
 */
export interface ActionTools {
  anthropicTools: Anthropic.Tool[];
  openAiTools: unknown[];
  execute: (name: string, args: Record<string, unknown>) => Promise<string>;
}

/** Tool-frei — sonst fährt `runAiAction` einen Agent-Loop statt eines einzelnen Calls. */
export const NO_TOOLS: ActionTools = {
  anthropicTools: [],
  openAiTools: [],
  execute: async () => '',
};

export function assembleAction<T>(
  spec: ActionSpec<T>,
  verb: { id: string; label: string },
  tools: ActionTools,
  buildSystemPrompt: () => string,
): AiAction<T> {
  return {
    id: `${verb.id}-${spec.entity}`,
    label: `${spec.nounDe} ${verb.label}`,
    ...tools,
    jsonSchema: spec.jsonSchema,
    validate: spec.validate,
    buildSystemPrompt,
  };
}

/** Vom Factory vorgefertigte Prompt-Bausteine; jeder ist '', wo er nicht zutrifft. */
export interface PromptParts {
  templateBlock: string; // „## Vorlage" — leer bei Anlage ohne Vorlage
  currentBlock: string; // „## Aktueller X" — nur Edit
  nameHint: string;
  categoryHint: string; // nur Item
}

export interface EntityActionSpec<T> extends ActionSpec<T> {
  currentHeading: string; // Überschrift des Edit-Kontextblocks
  /** Verzweigt selbst nach `parts.templateBlock` (mit/ohne Vorlage). */
  buildCreatePrompt: (parts: PromptParts) => string;
  buildEditPrompt: (parts: PromptParts) => string;
  nameHint?: (name: string) => string; // sonst Standard-Formulierung
  categoryHint?: (categoryKey: string) => string; // nur Item
  /** Fehlen sie, läuft die Aktion tool-frei (siehe `NO_TOOLS`). */
  anthropicTools?: Anthropic.Tool[];
  openAiTools?: unknown[];
  execute?: (name: string, args: Record<string, unknown>) => Promise<string>;
}
