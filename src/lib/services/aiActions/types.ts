/**
 * Generisches Framework für kontextabhängige KI-Aktionen.
 *
 * Eine `AiAction<T>` beschreibt eine dedizierte Aufgabe (z.B. „Gegenstand anlegen“):
 * spezifischer System-Prompt + Tools + JSON-Schema des Outputs. Der `runAiAction`
 * (siehe runner.ts) führt den Tool-Loop aus und liefert ein validiertes `T`.
 */
import type Anthropic from '@anthropic-ai/sdk';

export interface AiAction<T> {
  /** Stabile ID, z.B. 'create-item'. */
  id: string;
  /** Anzeigename für die UI. */
  label: string;
  /** Spezifischer System-Prompt (ohne Schema-Block — der wird vom Runner ergänzt). */
  buildSystemPrompt(): string;
  /** Anthropic-native Tool-Defs. */
  anthropicTools: Anthropic.Tool[];
  /** OpenAI-/Groq-kompatible Tool-Defs. */
  openAiTools: unknown[];
  /** Führt einen Tool-Aufruf aus. */
  execute(name: string, args: Record<string, unknown>): Promise<string>;
  /** JSON-Schema des erwarteten Outputs (Structured-Outputs-Subset). */
  jsonSchema: object;
  /** Leichte Laufzeitprüfung des Ergebnisses. */
  validate(data: unknown): data is T;
}
