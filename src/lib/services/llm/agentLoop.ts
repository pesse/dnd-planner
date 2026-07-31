/**
 * Agentic Loop mit Vault-Tools. Der OpenAI-kompatible Loop steht hier, der von
 * Anthropic im SDK-Modul; `agentLoop` wählt zwischen ihnen. Ollama kann kein
 * Tool-Calling und wird abgelehnt.
 */
import type { LlmConfig } from '../../types';
import { VAULT_TOOLSET, TASK_TEMPERATURE } from '../vaultTools';
import type { AgentOptions, AgentToolset } from '../vaultTools';
import { anthropicAgentLoop } from '../anthropicService';
import { effTemp, rustFetchStream, type StreamResult } from './transport';
import { GROQ_API, QUALITYMINDS_API } from './openAiCompatible';

const AGENT_MAX_ITERATIONS = 12;

/**
 * Groq gibt HTTP 400 zurück, wenn das Modell ungültige Tool-Calls generiert (z.B.
 * `<function>`-Tags). Zweimal korrigieren wir das per Nachricht, ohne eine Iteration
 * zu verbrauchen; danach fliegt der Fehler.
 */
const TOOL_FORMAT_REMINDER =
  'Dein letzter Tool-Aufruf war ungültig formatiert. ' +
  'Bitte verwende ausschließlich das tool_calls JSON-Format. ' +
  'Keine <function> Tags oder anderen Formate.';

async function openAiAgentLoop(
  config: LlmConfig,
  apiBase: string,
  authHeader: Record<string, string>,
  userMessage: string,
  systemPromptText: string,
  options: AgentOptions,
  toolset: AgentToolset
): Promise<string> {
  const { onStep, writeFile, signal } = options;
  const temp = effTemp(config, options.temperature ?? TASK_TEMPERATURE.agent);
  const msgs: unknown[] = [
    { role: 'system', content: systemPromptText },
    { role: 'user', content: userMessage },
  ];

  let toolUseFailedRetries = 0;

  for (let i = 0; i < AGENT_MAX_ITERATIONS; i++) {
    if (signal?.aborted) throw new Error('Agent abgebrochen.');
    options.onActivity?.();
    let stream: StreamResult;
    try {
      stream = await rustFetchStream(
        `${apiBase}/chat/completions`,
        authHeader,
        // parallel_tool_calls: false verbessert Zuverlässigkeit bei llama-Modellen erheblich
        { model: config.model, messages: msgs, tools: toolset.openAiTools, parallel_tool_calls: false, ...(temp != null ? { temperature: temp } : {}) },
        { provider: config.provider, label: `agent[${i}]` },
        () => options.onActivity?.(),
        signal,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('tool_use_failed') && toolUseFailedRetries < 2) {
        toolUseFailedRetries++;
        msgs.push({ role: 'user', content: TOOL_FORMAT_REMINDER });
        i--; // Iteration nicht verbrauchen
        continue;
      }
      throw e;
    }

    // Assistant-Message aus den gestreamten Deltas rekonstruieren (für die History).
    const message: Record<string, unknown> = { role: 'assistant', content: stream.content || null };
    if (stream.toolCalls.length) message.tool_calls = stream.toolCalls;
    msgs.push(message);

    if (stream.toolCalls.length === 0) {
      onStep({ type: 'done', text: stream.content });
      return stream.content;
    }

    for (const tc of stream.toolCalls) {
      const toolName = tc.function.name;
      const toolArgs = JSON.parse(tc.function.arguments || '{}') as Record<string, string>;

      onStep({ type: 'tool_call', tool: toolName, args: toolArgs });
      let result: string;
      try {
        result = await toolset.execute(toolName, toolArgs, writeFile);
      } catch (e) {
        result = `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
      onStep({ type: 'tool_result', tool: toolName, result });
      msgs.push({ role: 'tool', tool_call_id: tc.id, content: result });
    }
  }

  throw new Error(`Agent reached ${AGENT_MAX_ITERATIONS} iterations without finishing.`);
}

export async function agentLoop(
  config: LlmConfig,
  userMessage: string,
  systemPromptText: string,
  options: AgentOptions,
  toolset: AgentToolset = VAULT_TOOLSET
): Promise<string> {
  if (config.provider === 'anthropic') {
    if (!config.apiKey) throw new Error('No Anthropic API key configured.');
    return anthropicAgentLoop(config, userMessage, systemPromptText, options, toolset);
  }
  if (config.provider === 'groq') {
    if (!config.apiKey) throw new Error('No Groq API key configured.');
    return openAiAgentLoop(config, GROQ_API, { Authorization: `Bearer ${config.apiKey}` }, userMessage, systemPromptText, options, toolset);
  }
  if (config.provider === 'qualityminds') {
    if (!config.apiKey) throw new Error('No QualityMinds API key configured.');
    return openAiAgentLoop(config, QUALITYMINDS_API, { Authorization: `Bearer ${config.apiKey}` }, userMessage, systemPromptText, options, toolset);
  }
  throw new Error('Ollama does not support tool calling. Please use Groq, QualityMinds, or Anthropic.');
}
