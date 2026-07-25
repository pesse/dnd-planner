/**
 * Generischer Runner für KI-Aktionen.
 *
 * Ablauf:
 *   1) Tool-Loop (DnD-API o.ä.) über den portablen Agent-Loop — das Modell
 *      recherchiert und liefert am Ende einen JSON-Block.
 *   2) Structured Output: JSON parsen + validieren. Bei Fehler genau ein Retry —
 *      nativ via `client.generateStructured` (Anthropic via output_config, QM/vllm
 *      via structured_outputs) oder emuliert via erneutem `generate` (Groq/Ollama).
 *
 * Voraussetzung: das Modell kann Tools (`capabilities.tools`). Ollama wird hier
 * mit einer klaren Meldung abgewiesen.
 */
import type { LlmConfig } from '../../types';
import { getClient } from '../llmClient';
import { agentLoop, TASK_TEMPERATURE } from '../llmService';
import type { AgentStep, AgentToolset } from '../vaultTools';
import type { AiAction } from './types';
import { stripJsonFence } from '../jsonFence';

export interface RunOptions {
  onStep?: (step: AgentStep) => void;
  signal?: AbortSignal;
  /** Lebenszeichen pro Iteration/Streaming-Delta (für die Stuck-Erkennung der UI). */
  onActivity?: () => void;
  /**
   * Kein Nachbesserungs-Call bei ungültigem JSON. Standard: false (Prod macht einen
   * Retry). Für Prompt-Qualitäts-Evals true, damit die First-Try-Qualität des Prompts
   * gemessen wird und nicht der Retry sie kaschiert.
   */
  noRetry?: boolean;
}

/** Versucht, ein JSON-Objekt aus Freitext zu extrahieren (roh, ```json-Fence, erstes {…}). */
function extractJson(text: string): unknown {
  if (!text) return null;
  const candidates = [stripJsonFence(text), text.match(/\{[\s\S]*\}/)?.[0], text];
  for (const c of candidates) {
    if (!c) continue;
    try {
      return JSON.parse(c.trim());
    } catch {
      /* nächsten Kandidaten versuchen */
    }
  }
  return null;
}

export async function runAiAction<T>(
  config: LlmConfig,
  action: AiAction<T>,
  userInput: string,
  opts: RunOptions = {},
): Promise<T> {
  const client = getClient(config);
  // Tools werden nur für Actions benötigt, die welche definieren (z.B. DnD-API-Recherche).
  // Tool-freie Actions (Encounter-Entwurf) laufen als ein einziger Call — viel weniger Tokens.
  const usesTools = action.openAiTools.length > 0;
  if (usesTools && !client.capabilities.tools) {
    throw new Error(
      'Das gewählte Modell unterstützt keine Tools. Bitte ein Anthropic- oder Groq-Modell wählen.',
    );
  }
  const onStep = opts.onStep ?? (() => {});

  // Nativer Structured-Output erzwingt das Schema serverseitig; nur die Pfade, die
  // JSON per Prompt erbitten (Tool-Loop, emulierter generate), brauchen den Block.
  const baseSystem = action.buildSystemPrompt();
  const emulatedSystem =
    baseSystem +
    '\n\n## OUTPUT (CRITICAL)\n' +
    '- Return the final result as exactly ONE ```json code block.\n' +
    '- The JSON MUST match this schema exactly (no extra keys):\n' +
    JSON.stringify(action.jsonSchema, null, 2);

  let draftText = '';
  let data: unknown;

  if (usesTools) {
    // Recherche-Pfad: Agent-Loop mit Tools (DnD-API), endet mit einem JSON-Block.
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
    // Nativ schema-valide (Anthropic: output_config, QM/vllm: structured_outputs): ein Call.
    data = await client.generateStructured(userInput, action.jsonSchema, baseSystem, { signal: opts.signal });
    draftText = data != null ? JSON.stringify(data) : '';
  } else {
    // Tool-frei (Groq/Ollama): ein einziger generate-Call statt Agent-Loop, dann Regex-Extraktion.
    draftText = await client.generate(userInput, emulatedSystem, 'structured', () => opts.onActivity?.());
    data = extractJson(draftText);
  }

  if (!opts.noRetry && (!data || !action.validate(data))) {
    onStep({ type: 'tool_call', tool: 'json-korrektur', args: {} });
    if (client.generateStructured) {
      // Nativer Pfad (Anthropic/QM): garantiert schema-valides JSON aus dem Entwurf.
      data = await client.generateStructured(
        `Produce the final, schema-conformant JSON from the following draft:\n\n${draftText}`,
        action.jsonSchema,
        baseSystem,
        { signal: opts.signal },
      );
    } else {
      // Emuliert (Groq): erneut anfordern, dann parsen.
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
