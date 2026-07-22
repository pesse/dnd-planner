/**
 * Generischer Runner für KI-Aktionen.
 *
 * Ablauf:
 *   1) Tool-Loop (DnD-API o.ä.) über den portablen Agent-Loop — das Modell
 *      recherchiert und liefert am Ende einen JSON-Block.
 *   2) Structured Output: JSON parsen + validieren. Bei Fehler genau ein Retry —
 *      nativ via `generateStructured` (Anthropic, capabilities.structuredOutput)
 *      oder emuliert via erneutem `generate` (Groq).
 *
 * Voraussetzung: das Modell kann Tools (`capabilities.tools`). Ollama wird hier
 * mit einer klaren Meldung abgewiesen.
 */
import type { LlmConfig } from '../../types';
import { getClient } from '../llmClient';
import { agentLoop, TASK_TEMPERATURE } from '../llmService';
import type { AgentStep, AgentToolset } from '../vaultTools';
import { generateStructured } from '../anthropicExtras';
import type { AiAction } from './types';

export interface RunOptions {
  onStep?: (step: AgentStep) => void;
  signal?: AbortSignal;
  /** Lebenszeichen pro Iteration/Streaming-Delta (für die Stuck-Erkennung der UI). */
  onActivity?: () => void;
}

/** Versucht, ein JSON-Objekt aus Freitext zu extrahieren (roh, ```json-Fence, erstes {…}). */
function extractJson(text: string): unknown {
  if (!text) return null;
  const fenced = text.match(/```json\s*([\s\S]*?)```/i)?.[1] ?? text.match(/```\s*([\s\S]*?)```/)?.[1];
  const candidates = [fenced, text.match(/\{[\s\S]*\}/)?.[0], text];
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

  const system =
    action.buildSystemPrompt() +
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
      system,
      { onStep, signal: opts.signal, temperature: TASK_TEMPERATURE.structured, onActivity: opts.onActivity },
      toolset,
    );
    data = extractJson(draftText);
  } else if (client.capabilities.structuredOutput) {
    // Tool-frei + nativ schema-valide (Anthropic): ein Call, garantiert valides JSON.
    data = await generateStructured<T>(config, userInput, action.jsonSchema, system, { signal: opts.signal });
    draftText = data != null ? JSON.stringify(data) : '';
  } else {
    // Tool-frei (Groq/QM): ein einziger generate-Call statt Agent-Loop.
    draftText = await client.generate(userInput, system, 'structured', () => opts.onActivity?.());
    data = extractJson(draftText);
  }

  if (!data || !action.validate(data)) {
    onStep({ type: 'tool_call', tool: 'json-korrektur', args: {} });
    if (client.capabilities.structuredOutput) {
      // Nativer Pfad (Anthropic): garantiert schema-valides JSON aus dem Entwurf.
      data = await generateStructured<T>(
        config,
        `Produce the final, schema-conformant JSON from the following draft:\n\n${draftText}`,
        action.jsonSchema,
        action.buildSystemPrompt(),
        { signal: opts.signal },
      );
    } else {
      // Emuliert (Groq): erneut anfordern, dann parsen.
      const retry = await client.generate(
        `Your last JSON was invalid or incomplete. Return ONLY a valid ` +
          `\`\`\`json object matching the schema.\n\nSchema:\n${JSON.stringify(action.jsonSchema)}\n\n` +
          `Previous output:\n${draftText}`,
        system,
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
