/*
 * Aufbereitung von Debug-Einträgen (LlmPanel → Debug-Tab) für die Anzeige.
 *
 * Kern-Problem: `entry.data` ist ein strukturiertes Objekt, aber viele
 * verschachtelte Felder enthalten selbst JSON *als String* (OpenAI-Tool-Call-
 * `arguments`, Tool-Ergebnisse in `messages[].content`, structured-output-
 * `content`). Ein einfaches `JSON.stringify` zeigt diese doppelt escaped
 * (`"{\"query\":\"foo\"}"`). `reviveJson` entschachtelt sie vor der Anzeige.
 *
 * WICHTIG: rein anzeige-seitig. Es wird nie `entry.data` mutiert (der Store ist
 * live) und die echten API-Payloads bleiben unberührt — alle Funktionen liefern
 * neue Strukturen.
 */

import type { DebugEntry } from '../stores/debug';

const MAX_DEPTH = 8;

/**
 * Entschachtelt eingebettete JSON-Strings rekursiv: jeder String, der sich zu
 * einem Objekt/Array parsen lässt, wird durch die geparste Struktur ersetzt.
 * Primitive-Strings ("42", "true", "foo") bleiben unverändert — sonst würden
 * Werte fälschlich uminterpretiert. Baut ausschließlich neue Objekte/Arrays.
 */
export function reviveJson(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return value;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    // Nur Kandidaten anfassen, die wie Objekt/Array aussehen — spart Parse-Versuche.
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed !== null && typeof parsed === 'object') {
          return reviveJson(parsed, depth + 1);
        }
      } catch {
        /* kein JSON → String unverändert lassen */
      }
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((v) => reviveJson(v, depth + 1));
  }

  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = reviveJson(v, depth + 1);
    }
    return out;
  }

  return value;
}

/** `entry.data` entschachtelt + eingerückt als String (Fallback-/Roh-Ansicht). */
export function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(reviveJson(value), null, 2);
  } catch {
    // Zirkuläre Referenzen o. Ä. — best effort ohne revive.
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
}

// ── Anzeige-Modell ──────────────────────────────────────────────────────────

export interface DebugMessage {
  role: string;
  /** Bereits entschachtelter Inhalt (String oder Objekt/Array). */
  content: unknown;
  /** Tool-Aufrufe einer Assistant-Nachricht (OpenAI-Request-Historie). */
  toolCalls?: DebugToolCall[];
}

export interface DebugToolCall {
  name: string;
  /** Entschachtelte Argumente/Eingabe. */
  args: unknown;
}

export interface DebugBlock {
  type: string;
  /** Text bei `text`-Blöcken, entschachtelte Eingabe bei `tool_use`. */
  value: unknown;
  /** Tool-Name bei `tool_use`-Blöcken. */
  name?: string;
}

export type DebugView =
  | { kind: 'request'; url?: string; model?: string; messages: DebugMessage[]; tools: string[]; params: Record<string, unknown>; headers?: Record<string, unknown> }
  | { kind: 'response'; content: string; toolCalls: DebugToolCall[]; finishReason?: string; usage?: unknown }
  | { kind: 'anthropic'; blocks: DebugBlock[]; stopReason?: string; usage?: unknown }
  | { kind: 'error'; text: string }
  | { kind: 'note'; text: string }
  | { kind: 'raw'; value: unknown };

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function extractToolCalls(raw: unknown): DebugToolCall[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c) => {
    const rec = asRecord(c) ?? {};
    const fn = asRecord(rec.function) ?? {};
    return {
      name: (fn.name as string) ?? (rec.name as string) ?? 'tool',
      args: reviveJson(fn.arguments ?? rec.arguments ?? rec.input ?? {}),
    };
  });
}

function toMessages(raw: unknown, system?: unknown): DebugMessage[] {
  const msgs: DebugMessage[] = [];
  if (system != null && system !== '') {
    msgs.push({ role: 'system', content: reviveJson(system) });
  }
  if (Array.isArray(raw)) {
    for (const m of raw) {
      const rec = asRecord(m);
      if (!rec) continue;
      const msg: DebugMessage = {
        role: (rec.role as string) ?? 'unbekannt',
        content: reviveJson(rec.content),
      };
      const tc = extractToolCalls(rec.tool_calls);
      if (tc.length) msg.toolCalls = tc;
      msgs.push(msg);
    }
  }
  return msgs;
}

/**
 * Erkennt die Shape von `entry.data` (via vorhandene Felder + `entry.type`) und
 * liefert ein gegliedertes Anzeige-Modell. Unbekannte Shapes → `raw`.
 */
export function describeEntry(entry: DebugEntry): DebugView {
  const { data, type } = entry;

  if (type === 'error') {
    return { kind: 'error', text: typeof data === 'string' ? data : prettyJson(data) };
  }

  const rec = asRecord(data);

  // Sampling-Hinweis (anthropicService samplingParams): { note }
  if (rec && typeof rec.note === 'string' && Object.keys(rec).length === 1) {
    return { kind: 'note', text: rec.note };
  }

  if (type === 'request' && rec) {
    // Request-Body liegt entweder direkt (Anthropic: { body }) oder mit
    // Transport-Hülle (OpenAI/Ollama: { url, headers, body }) vor.
    const body = asRecord(rec.body) ?? rec;
    const { messages, system, model, tools, ...params } = body as Record<string, unknown>;
    return {
      kind: 'request',
      url: typeof rec.url === 'string' ? rec.url : undefined,
      model: typeof model === 'string' ? model : undefined,
      messages: toMessages(messages, system),
      tools: Array.isArray(tools)
        ? tools.map((t) => {
            const tr = asRecord(t);
            const fn = asRecord(tr?.function);
            return (fn?.name as string) ?? (tr?.name as string) ?? 'tool';
          })
        : [],
      params,
      headers: asRecord(rec.headers) ?? undefined,
    };
  }

  if (type === 'response' && rec) {
    // Anthropic-Message: content ist ein Block-Array.
    if (Array.isArray(rec.content)) {
      const blocks: DebugBlock[] = rec.content.map((b) => {
        const br = asRecord(b) ?? {};
        if (br.type === 'tool_use') {
          return { type: 'tool_use', name: br.name as string, value: reviveJson(br.input) };
        }
        return { type: (br.type as string) ?? 'text', value: reviveJson(br.text ?? br) };
      });
      return { kind: 'anthropic', blocks, stopReason: rec.stop_reason as string | undefined, usage: rec.usage };
    }

    // OpenAI-Stream-Response: { content, tool_calls, finish_reason, usage }
    if ('tool_calls' in rec || 'finish_reason' in rec) {
      return {
        kind: 'response',
        content: typeof rec.content === 'string' ? rec.content : '',
        toolCalls: extractToolCalls(rec.tool_calls),
        finishReason: rec.finish_reason as string | undefined,
        usage: rec.usage,
      };
    }

    // Ollama-Response: { message: { content }, ... }
    const message = asRecord(rec.message);
    if (message && typeof message.content === 'string') {
      return { kind: 'response', content: message.content, toolCalls: [] };
    }
  }

  return { kind: 'raw', value: data };
}
