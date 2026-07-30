/**
 * Beschreibt die ENTITY-spezifischen Unterschiede einer KI-Aktion. Das gemeinsame
 * Gerüst (AiAction-Boilerplate, JSON-Kontextblöcke, Namens-/Kategorie-Hinweis,
 * Tool-Anbindung) lebt in factory.ts. So bleibt pro Entität nur die Prosa + das
 * Schema übrig — der Create/Edit-Workflow ist „immer gleich, mit anderen Details".
 */

import type Anthropic from '@anthropic-ai/sdk';

/** Vom Factory vorgefertigte Prompt-Bausteine; jeder ist '', wo er nicht zutrifft. */
export interface PromptParts {
  templateBlock: string; // „## Vorlage" — leer bei Anlage ohne Vorlage
  currentBlock: string; // „## Aktueller X" — nur Edit
  nameHint: string;
  categoryHint: string; // nur Item
}

export interface EntityActionSpec<T> {
  entity: string; // 'item' | 'monster' | 'spell' | …
  nounDe: string; // fürs Label: „Gegenstand"
  currentHeading: string; // Überschrift des Edit-Kontextblocks
  jsonSchema: object;
  validate: (data: unknown) => data is T;
  /** Verzweigt selbst nach `parts.templateBlock` (mit/ohne Vorlage). */
  buildCreatePrompt: (parts: PromptParts) => string;
  buildEditPrompt: (parts: PromptParts) => string;
  nameHint?: (name: string) => string; // sonst Standard-Formulierung
  categoryHint?: (categoryKey: string) => string; // nur Item
  /**
   * Recherche-Tools; fehlen sie, greifen die DnD-API-Tools (Monster/Zauber). Die drei
   * gehören zusammen — eines allein zu setzen lässt den Tool-Loop ins Leere laufen.
   */
  anthropicTools?: Anthropic.Tool[];
  openAiTools?: unknown[];
  execute?: (name: string, args: Record<string, unknown>) => Promise<string>;
}
