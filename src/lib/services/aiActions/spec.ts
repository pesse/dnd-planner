/**
 * Beschreibt die ENTITY-spezifischen Unterschiede einer KI-Aktion. Das gemeinsame
 * Gerüst (AiAction-Boilerplate, JSON-Kontextblöcke, Namens-/Kategorie-Hinweis,
 * Tool-Anbindung) lebt in factory.ts. So bleibt pro Entität nur die Prosa + das
 * Schema übrig — der Create/Edit-Workflow ist „immer gleich, mit anderen Details".
 */

import type Anthropic from '@anthropic-ai/sdk';

/** Vom Factory vorgefertigte, mechanische Prompt-Bausteine. */
export interface PromptParts {
  /** Formatierter „## Vorlage"-Block (oder '' bei Anlage ohne Vorlage). */
  templateBlock: string;
  /** Formatierter „## Aktueller X"-Block (nur Edit). */
  currentBlock: string;
  /** Formatierter Hinweis auf den gewünschten Namen (oder ''). */
  nameHint: string;
  /** Formatierter Kategorie-Hinweis (nur Item, sonst ''). */
  categoryHint: string;
}

export interface EntityActionSpec<T> {
  /** Stabile Kurz-ID, z.B. 'item' | 'monster' | 'spell'. */
  entity: string;
  /** Deutsches Substantiv für Labels, z.B. 'Gegenstand'. */
  nounDe: string;
  /** Überschrift des Edit-Kontextblocks, z.B. 'Aktueller Gegenstand'. */
  currentHeading: string;
  /** LLM-JSON-Schema (aus toLlmJsonSchema(<entity>Schema)). */
  jsonSchema: object;
  /** Laufzeitprüfung des Ergebnisses. */
  validate: (data: unknown) => data is T;
  /** Anlage-Prompt; verzweigt selbst nach `parts.templateBlock` (mit/ohne Vorlage). */
  buildCreatePrompt: (parts: PromptParts) => string;
  /** Überarbeitungs-Prompt (nutzt `parts.currentBlock`). */
  buildEditPrompt: (parts: PromptParts) => string;
  /** Optionaler, entity-spezifischer Namens-Hinweis (sonst Standard-Formulierung). */
  nameHint?: (name: string) => string;
  /** Optionaler Kategorie-Hinweis (nur Item). */
  categoryHint?: (categoryKey: string) => string;
  /**
   * Optionale entity-spezifische Recherche-Tools. Fehlen sie, greifen die
   * DnD-API-Tools (Monster/Zauber). `item` liefert stattdessen die Open5e-Item-Tools.
   * Alle drei müssen gemeinsam gesetzt werden.
   */
  anthropicTools?: Anthropic.Tool[];
  openAiTools?: unknown[];
  execute?: (name: string, args: Record<string, unknown>) => Promise<string>;
}
