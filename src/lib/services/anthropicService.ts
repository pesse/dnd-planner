import Anthropic from '@anthropic-ai/sdk';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import type { LlmConfig } from '../types';
import { logDebug } from '../stores/debug';
import { addTokenUsage } from '../stores/llm';
import {
  VAULT_TOOLSET,
  TASK_TEMPERATURE,
  type ChatMessage,
  type AgentOptions,
  type AgentToolset,
} from './vaultTools';

export const DEFAULT_MAX_TOKENS = 4096;
const AGENT_MAX_ITERATIONS = 12;

/**
 * HTTP über das Tauri-Plugin, weil `api.anthropic.com` keine CORS-Header sendet und ein
 * direkter `fetch` aus dem Webview blockiert würde. `dangerouslyAllowBrowser` ist dabei
 * unbedenklich: der Key liegt ohnehin im Frontend, es gibt keinen fremden Origin.
 */
export function createClient(apiKey: string): Anthropic {
  return new Anthropic({
    apiKey,
    // Signatur des Tauri-`fetch` weicht minimal von `typeof fetch` ab (ClientOptions
    // im init), ist zur Laufzeit aber kompatibel.
    fetch: tauriFetch as unknown as typeof fetch,
    dangerouslyAllowBrowser: true,
  });
}

export function requireApiKey(config: LlmConfig): string {
  if (!config.apiKey) {
    throw new Error('Kein Anthropic API-Key konfiguriert. Bitte unter ⚙ eintragen.');
  }
  return config.apiKey;
}

// Modelle, die sampling-Parameter (temperature/top_p/top_k) nicht mehr akzeptieren —
// ab Opus 4.7 (inkl. 4.8) und Fable/Mythos 5. Dort steuert man über effort + Prompting.
const NO_SAMPLING = /opus-4-(7|8)|fable-5|mythos-5/;

export function modelSupportsTemperature(model: string): boolean {
  return !NO_SAMPLING.test(model);
}

/**
 * Globaler Override gewinnt gegen das per-Call-Preset; ohne sampling-Support wird
 * Temperature still verworfen, weil sie sonst einen 400 auslöst.
 */
function samplingParams(config: LlmConfig, perCall: number | undefined, label: string): { temperature?: number } {
  const temp = config.temperature ?? perCall;
  if (temp == null) return {};
  if (!modelSupportsTemperature(config.model)) {
    logDebug({
      provider: 'anthropic', type: 'request', label,
      data: { note: `temperature=${temp} verworfen — ${config.model} ignoriert sampling-Parameter` },
    });
    return {};
  }
  return { temperature: temp };
}

/** Erstes Text-Block-Ergebnis einer Antwort (Tool-Use-Blöcke werden übersprungen). */
export function firstText(message: Anthropic.Message): string {
  const block = message.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  return block?.text ?? '';
}

/**
 * Zentraler Aufruf-Wrapper mit Debug-Logging und Token-Tracking. `signal` geht ans SDK
 * durch, damit ein Abbruch den laufenden Request wirklich cancelt.
 */
export async function createMessage(
  client: Anthropic,
  params: Anthropic.MessageCreateParamsNonStreaming,
  label: string,
  signal?: AbortSignal,
  /** Wenn gesetzt, wird gestreamt und pro Text-Delta aufgerufen (für Live-/Stuck-Status). */
  onDelta?: (text: string) => void
): Promise<Anthropic.Message> {
  const start = Date.now();
  logDebug({ provider: 'anthropic', type: 'request', label, data: { body: params } });
  try {
    let message: Anthropic.Message;
    if (onDelta) {
      const stream = client.messages.stream(params as Anthropic.MessageStreamParams, signal ? { signal } : undefined);
      stream.on('text', (t) => onDelta(t));
      message = await stream.finalMessage();
    } else {
      message = await client.messages.create(params, signal ? { signal } : undefined);
    }
    logDebug({ provider: 'anthropic', type: 'response', label, data: message, durationMs: Date.now() - start });
    addTokenUsage({ sent: message.usage.input_tokens, received: message.usage.output_tokens });
    return message;
  } catch (e) {
    logDebug({ provider: 'anthropic', type: 'error', label, data: String(e), durationMs: Date.now() - start });
    throw e;
  }
}

export async function anthropicChat(
  config: LlmConfig,
  messages: ChatMessage[],
  temperature?: number
): Promise<string> {
  const client = createClient(requireApiKey(config));
  const system = messages.find((m) => m.role === 'system')?.content;
  const conversation: Anthropic.MessageParam[] = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  const message = await createMessage(
    client,
    {
      model: config.model,
      max_tokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...samplingParams(config, temperature, 'chat'),
      ...(system ? { system } : {}),
      messages: conversation,
    },
    'chat'
  );
  return firstText(message);
}

export async function anthropicGenerate(
  config: LlmConfig,
  prompt: string,
  system?: string,
  temperature?: number
): Promise<string> {
  const client = createClient(requireApiKey(config));
  const message = await createMessage(
    client,
    {
      model: config.model,
      max_tokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...samplingParams(config, temperature, 'generate'),
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: prompt }],
    },
    'generate'
  );
  return firstText(message);
}

export async function anthropicAgentLoop(
  config: LlmConfig,
  userMessage: string,
  systemPromptText: string,
  options: AgentOptions,
  toolset: AgentToolset = VAULT_TOOLSET
): Promise<string> {
  const { onStep, writeFile, signal } = options;
  const temperature = options.temperature ?? TASK_TEMPERATURE.agent;
  const client = createClient(requireApiKey(config));
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage }];

  for (let i = 0; i < AGENT_MAX_ITERATIONS; i++) {
    if (signal?.aborted) throw new Error('Agent abgebrochen.');
    options.onActivity?.();

    const response = await createMessage(
      client,
      {
        model: config.model,
        max_tokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
        ...samplingParams(config, temperature, `agent[${i}]`),
        system: systemPromptText,
        messages,
        tools: toolset.anthropicTools,
      },
      `agent[${i}]`,
      signal,
      options.onActivity ? () => options.onActivity!() : undefined
    );

    messages.push({ role: 'assistant', content: response.content });

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    );

    if (toolUseBlocks.length > 0) {
      // Tool-Calls verarbeiten — unabhängig vom stop_reason (deckt auch 'max_tokens' ab).
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        const toolArgs = block.input as Record<string, string>;
        onStep({ type: 'tool_call', tool: block.name, args: toolArgs });
        let result: string;
        try {
          result = await toolset.execute(block.name, toolArgs, writeFile);
        } catch (e) {
          result = `Error: ${e instanceof Error ? e.message : String(e)}`;
        }
        onStep({ type: 'tool_result', tool: block.name, result });
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
      }
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    if (response.stop_reason === 'end_turn' || response.stop_reason === 'stop_sequence') {
      const text = firstText(response);
      onStep({ type: 'done', text });
      return text;
    }

    if (response.stop_reason === 'refusal') {
      throw new Error('Anthropic hat die Anfrage aus Sicherheitsgründen abgelehnt (refusal).');
    }

    // max_tokens oder anderer unerwarteter stop_reason ohne Tool-Calls
    throw new Error(`Agent stopped unexpectedly (stop_reason: ${response.stop_reason})`);
  }

  throw new Error(`Agent reached ${AGENT_MAX_ITERATIONS} iterations without finishing.`);
}
