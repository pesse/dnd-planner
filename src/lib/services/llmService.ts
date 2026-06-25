import { invoke } from '@tauri-apps/api/core';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import type { LlmConfig } from '../types';
import { logDebug } from '../stores/debug';
import { addTokenUsage } from '../stores/llm';
import { VAULT_TOOLSET, TASK_TEMPERATURE } from './vaultTools';
import type { ChatMessage, AgentOptions, AgentToolset } from './vaultTools';
import { withRateLimitRetry } from './retry';

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

// ── Streaming (OpenAI-kompatibles SSE via Rust-Channel) ─────────────────────────

interface StreamToolCall { id: string; type: 'function'; function: { name: string; arguments: string }; }
interface StreamResult { content: string; toolCalls: StreamToolCall[]; finishReason: string; }

/**
 * Streamt eine OpenAI-kompatible `/chat/completions`-Antwort chunk-weise.
 * Setzt `stream: true` + `stream_options.include_usage` und akkumuliert
 * content + tool_calls (delta-basiert, indexiert) zu einem vollständigen Ergebnis.
 * Verhindert nginx-504s, da der Server bereits Tokens sendet, bevor er fertig ist.
 * `onDelta` (optional) erhält jeden content-Teil live (für UI-Streaming).
 */
async function rustFetchStream(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  meta: DebugMeta,
  onDelta?: (delta: string) => void,
  signal?: AbortSignal,
): Promise<StreamResult> {
  if (signal?.aborted) throw new Error('Agent abgebrochen.');
  const fullBody = { ...body, stream: true, stream_options: { include_usage: true } };

  // Ein einzelner Stream-Versuch. Wird bei Rate-Limit (429) von withRateLimitRetry
  // erneut aufgerufen — daher lebt der gesamte mutable State hier in der Closure,
  // damit jeder Versuch frisch startet. Ein 429 kommt beim Status-Check an, bevor
  // Tokens gestreamt werden, es wurden also noch keine Teil-Deltas an onDelta
  // ausgeliefert.
  const attempt = async (): Promise<StreamResult> => {
    const start = Date.now();
    logDebug({
      provider: meta.provider, type: 'request', label: meta.label,
      data: { url, headers: sanitizeHeaders({ 'Content-Type': 'application/json', ...headers }), body: fullBody },
    });

    let content = '';
    let finishReason = '';
    let usage: { sent: number; received: number } | null = null;
    const toolCalls: StreamToolCall[] = [];

    const handleData = (json: Record<string, unknown>) => {
      const u = json.usage as Record<string, number> | undefined;
      if (u?.prompt_tokens != null) usage = { sent: u.prompt_tokens, received: u.completion_tokens ?? 0 };
      const choice = (json.choices as Array<Record<string, unknown>> | undefined)?.[0];
      if (!choice) return;
      const delta = (choice.delta as Record<string, unknown>) ?? {};
      if (typeof delta.content === 'string') { content += delta.content; onDelta?.(delta.content); }
      const deltaCalls = delta.tool_calls as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(deltaCalls)) {
        for (const d of deltaCalls) {
          const idx = (d.index as number) ?? 0;
          toolCalls[idx] ??= { id: '', type: 'function', function: { name: '', arguments: '' } };
          const f = d.function as Record<string, string> | undefined;
          if (d.id) toolCalls[idx].id = d.id as string;
          if (f?.name) toolCalls[idx].function.name = f.name;
          if (f?.arguments) toolCalls[idx].function.arguments += f.arguments;
        }
      }
      if (choice.finish_reason) finishReason = choice.finish_reason as string;
    };

    // SSE-Frames (`data: …\n`) über Chunk-Grenzen hinweg puffern.
    let buffer = '';
    const processChunk = (chunk: string) => {
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '' || payload === '[DONE]') continue;
        try { handleData(JSON.parse(payload) as Record<string, unknown>); } catch { /* unvollständige Zeile überspringen */ }
      }
    };

    try {
      // Rust-backed fetch (plugin-http) — derselbe Weg wie der Anthropic-SDK-Pfad:
      // umgeht CORS, streamt den Body inkrementell und unterstützt echtes Abbrechen
      // über das AbortSignal (`fetch_cancel`).
      const res = await tauriFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(fullBody),
        signal,
      });
      if (res.status >= 400) {
        const errText = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${errText}`);
      }
      if (!res.body) throw new Error('Keine Stream-Antwort erhalten.');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) processChunk(decoder.decode(value, { stream: true }));
      }
      processChunk(decoder.decode()); // Restpuffer leeren
    } catch (e) {
      logDebug({ provider: meta.provider, type: 'error', label: meta.label, data: String(e), durationMs: Date.now() - start });
      throw e;
    }

    const compact = toolCalls.filter(Boolean); // tool_calls können sparse indexiert sein
    logDebug({
      provider: meta.provider, type: 'response', label: meta.label,
      data: { content, tool_calls: compact, finish_reason: finishReason, usage }, durationMs: Date.now() - start,
    });
    if (usage) addTokenUsage(usage);

    return { content, toolCalls: compact, finishReason };
  };

  // Rate-Limits (HTTP 429) abwarten + erneut versuchen — transparent für die Aufrufer.
  // Der sichtbare Hinweis (Toast) wird zentral in withRateLimitRetry erzeugt; hier
  // halten wir nur die UI-Aktivität (onActivity-Lebenszeichen) während der Wartezeit am Leben.
  return withRateLimitRetry(attempt, {
    signal,
    provider: meta.provider,
    onWait: () => onDelta?.(''),
  });
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
async function openAiCompatChat(config: LlmConfig, apiBase: string, messages: ChatMessage[], temperature?: number, onDelta?: (delta: string) => void): Promise<string> {
  if (!config.apiKey) throw new Error(`Kein API-Key für ${config.provider} konfiguriert. Bitte unter ⚙ eintragen.`);
  const temp = effTemp(config, temperature);
  const { content } = await rustFetchStream(
    `${apiBase}/chat/completions`,
    { Authorization: `Bearer ${config.apiKey}` },
    { model: config.model, messages, ...(temp != null ? { temperature: temp } : {}) },
    { provider: config.provider, label: 'chat' },
    onDelta,
  );
  return content;
}

function openAiCompatGenerate(config: LlmConfig, apiBase: string, prompt: string, system?: string, temperature?: number, onDelta?: (delta: string) => void): Promise<string> {
  const messages: ChatMessage[] = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });
  return openAiCompatChat(config, apiBase, messages, temperature, onDelta);
}

export const groqChat = (c: LlmConfig, m: ChatMessage[], t?: number, onDelta?: (d: string) => void) => openAiCompatChat(c, GROQ_API, m, t, onDelta);
export const groqGenerate = (c: LlmConfig, p: string, s?: string, t?: number, onDelta?: (d: string) => void) => openAiCompatGenerate(c, GROQ_API, p, s, t, onDelta);

export const xaiChat = (c: LlmConfig, m: ChatMessage[], t?: number, onDelta?: (d: string) => void) => openAiCompatChat(c, XAI_API, m, t, onDelta);
export const xaiGenerate = (c: LlmConfig, p: string, s?: string, t?: number, onDelta?: (d: string) => void) => openAiCompatGenerate(c, XAI_API, p, s, t, onDelta);

export const qualitymindsChat = (c: LlmConfig, m: ChatMessage[], t?: number, onDelta?: (d: string) => void) => openAiCompatChat(c, QUALITYMINDS_API, m, t, onDelta);
export const qualitymindsGenerate = (c: LlmConfig, p: string, s?: string, t?: number, onDelta?: (d: string) => void) => openAiCompatGenerate(c, QUALITYMINDS_API, p, s, t, onDelta);

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

    // Assistant-Message aus den gestreamten Deltas rekonstruieren (für die History).
    const message: Record<string, unknown> = { role: 'assistant', content: stream.content || null };
    if (stream.toolCalls.length) message.tool_calls = stream.toolCalls;
    msgs.push(message);

    // Tool-Calls vorhanden → ausführen und weiterloopen; sonst sind wir fertig.
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
