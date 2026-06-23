/**
 * Generischer Runner für KI-Aktionen.
 *
 * Ablauf:
 *   1) Tool-Loop (DnD-API o.ä.) über den portablen Agent-Loop — das Modell
 *      recherchiert und liefert am Ende einen JSON-Block.
 *   2) Structured Output: JSON parsen + validieren. Bei Fehler genau ein Retry —
 *      nativ via `generateStructured` (Anthropic, capabilities.structuredOutput)
 *      oder emuliert via erneutem `generate` (Groq/xAI).
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
  if (!client.capabilities.tools) {
    throw new Error(
      'Das gewählte Modell unterstützt keine Tools. Bitte ein Anthropic-, Groq- oder xAI-Modell wählen.',
    );
  }
  const onStep = opts.onStep ?? (() => {});

  const system =
    action.buildSystemPrompt() +
    '\n\n## OUTPUT (CRITICAL)\n' +
    '- Nach Abschluss der Recherche: gib das Ergebnis als EINEN ```json-Block aus.\n' +
    '- Das JSON MUSS exakt diesem Schema entsprechen (keine zusätzlichen Schlüssel):\n' +
    JSON.stringify(action.jsonSchema, null, 2);

  const toolset: AgentToolset = {
    anthropicTools: action.anthropicTools,
    openAiTools: action.openAiTools,
    execute: (name, args) => action.execute(name, args),
  };

  const finalText = await agentLoop(
    config,
    userInput,
    system,
    { onStep, signal: opts.signal, temperature: TASK_TEMPERATURE.structured, onActivity: opts.onActivity },
    toolset,
  );

  let data = extractJson(finalText);

  if (!data || !action.validate(data)) {
    onStep({ type: 'tool_call', tool: 'json-korrektur', args: {} });
    if (client.capabilities.structuredOutput) {
      // Nativer Pfad (Anthropic): garantiert schema-valides JSON aus dem Entwurf.
      data = await generateStructured<T>(
        config,
        `Erzeuge aus dem folgenden Entwurf das finale, schema-konforme JSON:\n\n${finalText}`,
        action.jsonSchema,
        action.buildSystemPrompt(),
      );
    } else {
      // Emuliert (Groq/xAI): erneut anfordern, dann parsen.
      const retry = await client.generate(
        `Dein letztes JSON war ungültig oder unvollständig. Gib AUSSCHLIESSLICH ein valides ` +
          `\`\`\`json-Objekt gemäß Schema zurück.\n\nSchema:\n${JSON.stringify(action.jsonSchema)}\n\n` +
          `Vorheriger Output:\n${finalText}`,
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
