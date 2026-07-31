/**
 * Generischer Runner für KI-Aktionen — hier sitzt die Provider-Matrix.
 *
 * Drei Pfade, weil nur ein Teil der Provider Schemata serverseitig erzwingt: Anthropic
 * (`output_config`) und QM/vllm (`structured_outputs`) sind nativ schema-valide, Groq und
 * Ollama bekommen das Schema als Prompt-Block und werden per Regex ausgewertet. Tools
 * können nur Anthropic und Groq — eine Aktion mit Tools auf Ollama wird abgewiesen.
 */
import type { LlmConfig } from '../../types';
import { getClient } from '../llmClient';
import { agentLoop } from '../llm/agentLoop';
import { TASK_TEMPERATURE } from '../vaultTools';
import type { AgentStep, AgentToolset } from '../vaultTools';
import type { AiAction } from './types';
import { extractJson } from '../jsonFence';

export interface RunOptions {
  onStep?: (step: AgentStep) => void;
  signal?: AbortSignal;
  onActivity?: () => void; // Lebenszeichen pro Iteration/Delta (Stuck-Erkennung der UI)
  /** Für Prompt-Evals true: sonst kaschiert der Retry die First-Try-Qualität des Prompts. */
  noRetry?: boolean;
}

/**
 * Schema als Prompt-Block, für die Pfade ohne nativen Structured Output. Exportiert, damit
 * die Eval-Prompt-Werkstatt (`structured: 'prompt'`) exakt denselben Wortlaut misst.
 */
export function jsonOutputInstruction(jsonSchema: object): string {
  return (
    '\n\n## OUTPUT (CRITICAL)\n' +
    '- Return the final result as exactly ONE ```json code block.\n' +
    '- The JSON MUST match this schema exactly (no extra keys):\n' +
    JSON.stringify(jsonSchema, null, 2)
  );
}

export async function runAiAction<T>(
  config: LlmConfig,
  action: AiAction<T>,
  userInput: string,
  opts: RunOptions = {},
): Promise<T> {
  const client = getClient(config);
  // Tool-freie Actions (Encounter-Entwurf, Übersetzung) laufen als EIN Call — deutlich
  // weniger Tokens als ein Agent-Loop.
  const usesTools = action.openAiTools.length > 0;
  if (usesTools && !client.capabilities.tools) {
    throw new Error(
      'Das gewählte Modell unterstützt keine Tools. Bitte ein Anthropic- oder Groq-Modell wählen.',
    );
  }
  const onStep = opts.onStep ?? (() => {});

  const baseSystem = action.buildSystemPrompt();
  const emulatedSystem = baseSystem + jsonOutputInstruction(action.jsonSchema);

  let draftText = '';
  let data: unknown;

  if (usesTools) {
    const toolset: AgentToolset = {
      anthropicTools: action.anthropicTools,
      openAiTools: action.openAiTools,
      execute: (name, args) => action.execute(name, args),
    };
    draftText = await agentLoop(
      config,
      userInput,
      emulatedSystem,
      { onStep, signal: opts.signal, temperature: TASK_TEMPERATURE.structured, onActivity: opts.onActivity },
      toolset,
    );
    data = extractJson(draftText);
  } else if (client.generateStructured) {
    data = await client.generateStructured(userInput, action.jsonSchema, baseSystem, { signal: opts.signal });
    draftText = data != null ? JSON.stringify(data) : '';
  } else {
    // Emuliert (Groq/Ollama): Schema nur im Prompt, Ergebnis per Regex aus dem Text.
    draftText = await client.generate(userInput, emulatedSystem, 'structured', () => opts.onActivity?.());
    data = extractJson(draftText);
  }

  if (!opts.noRetry && (!data || !action.validate(data))) {
    onStep({ type: 'tool_call', tool: 'json-korrektur', args: {} });
    if (client.generateStructured) {
      // Der Entwurf ist der Input: nativ erzwungen kommt er garantiert schema-valide zurück.
      data = await client.generateStructured(
        `Produce the final, schema-conformant JSON from the following draft:\n\n${draftText}`,
        action.jsonSchema,
        baseSystem,
        { signal: opts.signal },
      );
    } else {
      const retry = await client.generate(
        `Your last JSON was invalid or incomplete. Return ONLY a valid ` +
          `\`\`\`json object matching the schema.\n\nSchema:\n${JSON.stringify(action.jsonSchema)}\n\n` +
          `Previous output:\n${draftText}`,
        emulatedSystem,
        'structured',
      );
      data = extractJson(retry);
    }
    onStep({ type: 'tool_result', tool: 'json-korrektur', result: data ? 'ok' : 'fehlgeschlagen' });
  }

  if (!data || !action.validate(data)) {
    throw new Error('Die KI lieferte kein valides JSON.');
  }
  return data;
}
