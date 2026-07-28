/**
 * Generisches Framework für kontextabhängige KI-Aktionen.
 *
 * Eine `AiAction<T>` beschreibt eine dedizierte Aufgabe (z.B. „Gegenstand anlegen“):
 * spezifischer System-Prompt + Tools + JSON-Schema des Outputs. Der `runAiAction`
 * (siehe runner.ts) führt den Tool-Loop aus und liefert ein validiertes `T`.
 */
import type Anthropic from '@anthropic-ai/sdk';

export interface AiAction<T> {
  id: string; // stabil, z.B. 'create-item'
  label: string; // für die UI
  /** OHNE Schema-Block — den ergänzt der Runner je nach Provider-Pfad. */
  buildSystemPrompt(): string;
  anthropicTools: Anthropic.Tool[];
  openAiTools: unknown[]; // dieselben Tools für OpenAI/Groq
  execute(name: string, args: Record<string, unknown>): Promise<string>;
  jsonSchema: object; // Structured-Outputs-Subset
  validate(data: unknown): data is T;
}
