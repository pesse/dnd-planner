/**
 * HTTP-Transport aller LLM-Provider außer Anthropic (das hat sein SDK). Hier hängen
 * Debug-Mitschnitt, Token-Zählung und Rate-Limit-Retry.
 */
import { invoke } from '@tauri-apps/api/core';
import { httpFetch } from '../httpFetch';
import type { LlmConfig } from '../../types';
import { logDebug } from '../../stores/debug';
import { addTokenUsage } from '../../stores/llm';
import { withRateLimitRetry } from '../retry';

export interface DebugMeta { provider: string; label: string; }

export interface StreamToolCall { id: string; type: 'function'; function: { name: string; arguments: string }; }
export interface StreamResult { content: string; toolCalls: StreamToolCall[]; finishReason: string; reasoningChars: number; }

/** Effektive Temperatur: globaler Override (config.temperature) gewinnt gegen das Call-Site-Preset. */
export function effTemp(config: LlmConfig, perCall?: number): number | undefined {
  return config.temperature ?? perCall;
}

function extractTokenUsage(provider: string, data: Record<string, unknown>): { sent: number; received: number } | null {
  if (provider === 'groq' || provider === 'qualityminds') {
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

export async function rustFetch(
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

function mergeToolCallDeltas(toolCalls: StreamToolCall[], deltas: Array<Record<string, unknown>>): void {
  for (const d of deltas) {
    const idx = (d.index as number) ?? 0;
    toolCalls[idx] ??= { id: '', type: 'function', function: { name: '', arguments: '' } };
    const f = d.function as Record<string, string> | undefined;
    if (d.id) toolCalls[idx].id = d.id as string;
    if (f?.name) toolCalls[idx].function.name = f.name;
    if (f?.arguments) toolCalls[idx].function.arguments += f.arguments;
  }
}

/**
 * Chunk-weise, weil der Server damit Tokens sendet, bevor er fertig ist — das verhindert
 * die nginx-504s. `onReasoning` ist der GETRENNTE Kanal für den Denk-Vorlauf: `onDelta`
 * speist sichtbaren Text, in den der Denk-Text nicht gehört, `onReasoning` nur das
 * Lebenszeichen — ohne es hält der Aufrufer den Lauf minutenlang für hängengeblieben.
 */
export async function rustFetchStream(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  meta: DebugMeta,
  onDelta?: (delta: string) => void,
  signal?: AbortSignal,
  onReasoning?: (delta: string) => void,
): Promise<StreamResult> {
  if (signal?.aborted) throw new Error('Agent abgebrochen.');
  const fullBody = { ...body, stream: true, stream_options: { include_usage: true } };

  // Der mutable State lebt in der Closure, damit jeder Retry frisch startet. Ein 429 kommt
  // beim Status-Check an, bevor Tokens fließen — es wurde also noch kein Delta ausgeliefert.
  const attempt = async (): Promise<StreamResult> => {
    const start = Date.now();
    logDebug({
      provider: meta.provider, type: 'request', label: meta.label,
      data: { url, headers: sanitizeHeaders({ 'Content-Type': 'application/json', ...headers }), body: fullBody },
    });

    let content = '';
    let reasoning = '';
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
      // Beide Feldnamen mitnehmen, sonst hängt die Sichtbarkeit des Denkens am Server-Build
      // (Sonde 2026-07-29: hier kommt `reasoning`, ohne diesen Zweig sah der Client nichts).
      const think = typeof delta.reasoning === 'string' ? delta.reasoning
        : typeof delta.reasoning_content === 'string' ? delta.reasoning_content
        : '';
      if (think) { reasoning += think; onReasoning?.(think); }
      const deltaCalls = delta.tool_calls as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(deltaCalls)) mergeToolCallDeltas(toolCalls, deltaCalls);
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
      // Rust-backed fetch im Tauri-Kontext: umgeht CORS, streamt inkrementell und kann
      // echt abbrechen. Außerhalb von Tauri (Eval-Harness) fällt httpFetch aufs globale
      // fetch zurück, das beides ebenfalls kann.
      const res = await httpFetch(url, {
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
      data: {
        content, tool_calls: compact, finish_reason: finishReason, usage,
        reasoning_chars: reasoning.length,
        // Der Denk-Text NUR im Diagnose-Fall (leere Antwort) — dort ist er die einzige Spur,
        // warum nichts herauskam. Sonst bläht er jeden Mitschnitt um Tausende Zeichen auf.
        ...(content.trim() ? {} : { reasoning }),
      },
      durationMs: Date.now() - start,
    });
    if (usage) addTokenUsage(usage);

    return { content, toolCalls: compact, finishReason, reasoningChars: reasoning.length };
  };

  // Den Toast erzeugt `withRateLimitRetry` selbst; `onWait` hält hier nur das
  // Lebenszeichen der UI während der Wartezeit wach.
  return withRateLimitRetry(attempt, {
    signal,
    provider: meta.provider,
    onWait: () => onDelta?.(''),
  });
}
