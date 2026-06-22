import { invoke } from '@tauri-apps/api/core';
import type { LlmConfig } from '../types';
import { logDebug } from '../stores/debug';
import { addTokenUsage } from '../stores/llm';
import { VAULT_TOOLSET, TASK_TEMPERATURE } from './vaultTools';
import type { ChatMessage, AgentOptions, AgentToolset } from './vaultTools';

import { anthropicChat, anthropicGenerate, anthropicAgentLoop, modelSupportsTemperature } from './anthropicService';

// Geteilte Typen + der Anthropic-Pfad leben in eigenen Modulen; hier
// re-exportiert, damit `llmService` die stabile Fassade für alle Consumer bleibt.
export type { ChatMessage, AgentStep, AgentStepType, AgentOptions, TaskKind } from './vaultTools';
export { anthropicChat, anthropicGenerate, anthropicAgentLoop, modelSupportsTemperature, TASK_TEMPERATURE };

/** Effektive Temperatur: globaler Override (config.temperature) gewinnt gegen das Call-Site-Preset. */
function effTemp(config: LlmConfig, perCall?: number): number | undefined {
  return config.temperature ?? perCall;
}

// ── HTTP via Rust ─────────────────────────────────────────────────────────────

interface DebugMeta { provider: string; label: string; }

function extractTokenUsage(provider: string, data: Record<string, unknown>): { sent: number; received: number } | null {
  if (provider === 'groq' || provider === 'xai' || provider === 'qualityminds') {
    const u = data.usage as Record<string, number> | undefined;
    if (u?.prompt_tokens != null) return { sent: u.prompt_tokens, received: u.completion_tokens ?? 0 };
  } else if (provider === 'ollama') {
    const sent = data.prompt_eval_count as number | undefined;
    const received = data.eval_count as number | undefined;
    if (sent != null) return { sent, received: received ?? 0 };
  }
  return null;
}

function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([k, v]) =>
      ['authorization', 'x-api-key'].includes(k.toLowerCase()) ? [k, '[REDACTED]'] : [k, v]
    )
  );
}

async function rustFetch(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  meta?: DebugMeta
): Promise<unknown> {
  const start = Date.now();
  if (meta) {
    logDebug({
      provider: meta.provider, type: 'request', label: meta.label,
      data: { url, headers: sanitizeHeaders({ 'Content-Type': 'application/json', ...headers }), body },
    });
  }
  try {
    const text = await invoke<string>('http_request', {
      req: { url, method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) },
    });
    const result = JSON.parse(text);
    if (meta) {
      logDebug({ provider: meta.provider, type: 'response', label: meta.label, data: result, durationMs: Date.now() - start });
      const usage = extractTokenUsage(meta.provider, result as Record<string, unknown>);
      if (usage) addTokenUsage(usage);
    }
    return result;
  } catch (e) {
    if (meta) logDebug({ provider: meta.provider, type: 'error', label: meta.label, data: String(e), durationMs: Date.now() - start });
    throw e;
  }
}

// ── Ollama ────────────────────────────────────────────────────────────────────

export async function ollamaChat(config: LlmConfig, messages: ChatMessage[], temperature?: number): Promise<string> {
  const temp = effTemp(config, temperature);
  const body: Record<string, unknown> = { model: config.model, messages, stream: false };
  if (temp != null) body.options = { temperature: temp };
  const data = await rustFetch(`${config.baseUrl}/api/chat`, {}, body, { provider: 'ollama', label: 'chat' }) as Record<string, unknown>;
  return (data.message as Record<string, string>)?.content ?? '';
}

export async function ollamaGenerate(config: LlmConfig, prompt: string, system?: string, temperature?: number): Promise<string> {
  const temp = effTemp(config, temperature);
  const body: Record<string, unknown> = { model: config.model, prompt, stream: false };
  if (system) body.system = system;
  if (temp != null) body.options = { temperature: temp };
  const data = await rustFetch(`${config.baseUrl}/api/generate`, {}, body, { provider: 'ollama', label: 'generate' }) as Record<string, unknown>;
  return (data.response as string) ?? '';
}

// ── OpenAI-kompatible Provider (Groq, xAI, QualityMinds) ────────────────────────
// Identische Technik (OpenAI /chat/completions), getrennte Identität: jeder
// Provider hat eigene Base-URL, eigenen Keychain-Slot und eigenes UI-Label.

const GROQ_API = 'https://api.groq.com/openai/v1';
const XAI_API = 'https://api.x.ai/v1';
const QUALITYMINDS_API = 'https://code.qualityminds.ai/v1';

/** Gemeinsame Chat-Implementierung. `apiBase` + Key bestimmen den konkreten Provider. */
async function openAiCompatChat(config: LlmConfig, apiBase: string, messages: ChatMessage[], temperature?: number): Promise<string> {
  if (!config.apiKey) throw new Error(`Kein API-Key für ${config.provider} konfiguriert. Bitte unter ⚙ eintragen.`);
  const temp = effTemp(config, temperature);
  const data = await rustFetch(
    `${apiBase}/chat/completions`,
    { Authorization: `Bearer ${config.apiKey}` },
    { model: config.model, messages, ...(temp != null ? { temperature: temp } : {}) },
    { provider: config.provider, label: 'chat' }
  ) as Record<string, unknown>;
  const choices = data.choices as Array<Record<string, unknown>>;
  return (choices?.[0]?.message as Record<string, string>)?.content ?? '';
}

function openAiCompatGenerate(config: LlmConfig, apiBase: string, prompt: string, system?: string, temperature?: number): Promise<string> {
  const messages: ChatMessage[] = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });
  return openAiCompatChat(config, apiBase, messages, temperature);
}

export const groqChat = (c: LlmConfig, m: ChatMessage[], t?: number) => openAiCompatChat(c, GROQ_API, m, t);
export const groqGenerate = (c: LlmConfig, p: string, s?: string, t?: number) => openAiCompatGenerate(c, GROQ_API, p, s, t);

export const xaiChat = (c: LlmConfig, m: ChatMessage[], t?: number) => openAiCompatChat(c, XAI_API, m, t);
export const xaiGenerate = (c: LlmConfig, p: string, s?: string, t?: number) => openAiCompatGenerate(c, XAI_API, p, s, t);

export const qualitymindsChat = (c: LlmConfig, m: ChatMessage[], t?: number) => openAiCompatChat(c, QUALITYMINDS_API, m, t);
export const qualitymindsGenerate = (c: LlmConfig, p: string, s?: string, t?: number) => openAiCompatGenerate(c, QUALITYMINDS_API, p, s, t);

// ── Agentic Loop ──────────────────────────────────────────────────────────────

const AGENT_MAX_ITERATIONS = 12;

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
    let data: Record<string, unknown>;
    try {
      data = await rustFetch(
        `${apiBase}/chat/completions`,
        authHeader,
        // parallel_tool_calls: false verbessert Zuverlässigkeit bei llama-Modellen erheblich
        { model: config.model, messages: msgs, tools: toolset.openAiTools, parallel_tool_calls: false, ...(temp != null ? { temperature: temp } : {}) },
        { provider: config.provider, label: `agent[${i}]` }
      ) as Record<string, unknown>;
    } catch (e) {
      // Groq gibt HTTP 400 zurück wenn das Modell ungültige Tool-Calls generiert (z.B. <function> Tags).
      // Einmal korrigieren und nochmal versuchen.
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('tool_use_failed') && toolUseFailedRetries < 2) {
        toolUseFailedRetries++;
        msgs.push({
          role: 'user',
          content:
            'Dein letzter Tool-Aufruf war ungültig formatiert. ' +
            'Bitte verwende ausschließlich das tool_calls JSON-Format. ' +
            'Keine <function> Tags oder anderen Formate.',
        });
        i--; // Iteration nicht verbrauchen
        continue;
      }
      throw e;
    }

    const choice = (data.choices as Array<Record<string, unknown>>)?.[0];
    const message = choice?.message as Record<string, unknown>;
    const finishReason = choice?.finish_reason as string;

    msgs.push(message);

    if (finishReason === 'stop') {
      const text = (message?.content as string) ?? '';
      onStep({ type: 'done', text });
      return text;
    }

    if (finishReason === 'tool_calls') {
      const toolCalls = message.tool_calls as Array<Record<string, unknown>>;
      for (const tc of toolCalls) {
        const fn = tc.function as Record<string, string>;
        const toolName = fn.name;
        const toolArgs = JSON.parse(fn.arguments) as Record<string, string>;

        onStep({ type: 'tool_call', tool: toolName, args: toolArgs });
        let result: string;
        try {
          result = await toolset.execute(toolName, toolArgs, writeFile);
        } catch (e) {
          result = `Error: ${e instanceof Error ? e.message : String(e)}`;
        }
        onStep({ type: 'tool_result', tool: toolName, result });
        msgs.push({ role: 'tool', tool_call_id: tc.id as string, content: result });
      }
    }
  }

  throw new Error(`Agent reached ${AGENT_MAX_ITERATIONS} iterations without finishing.`);
}

/**
 * Führt einen Agentic Loop mit Vault-Tools aus.
 * Ollama wird nicht unterstützt (kein Tool Calling).
 */
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
  if (config.provider === 'xai') {
    if (!config.apiKey) throw new Error('No xAI API key configured.');
    return openAiAgentLoop(config, XAI_API, { Authorization: `Bearer ${config.apiKey}` }, userMessage, systemPromptText, options, toolset);
  }
  if (config.provider === 'qualityminds') {
    if (!config.apiKey) throw new Error('No QualityMinds API key configured.');
    return openAiAgentLoop(config, QUALITYMINDS_API, { Authorization: `Bearer ${config.apiKey}` }, userMessage, systemPromptText, options, toolset);
  }
  throw new Error('Ollama does not support tool calling. Please use Groq, xAI, QualityMinds, or Anthropic.');
}
