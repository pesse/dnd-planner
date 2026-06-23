/**
 * Beschreibt die ENTITY-spezifischen Unterschiede einer KI-Aktion. Das gemeinsame
 * Gerüst (AiAction-Boilerplate, JSON-Kontextblöcke, Namens-/Kategorie-Hinweis,
 * Tool-Anbindung) lebt in factory.ts. So bleibt pro Entität nur die Prosa + das
 * Schema übrig — der Create/Edit-Workflow ist „immer gleich, mit anderen Details".
 */

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
}
