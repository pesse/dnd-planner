import { invoke } from '@tauri-apps/api/core';
import type { LlmConfig } from '../types';
import { logDebug } from '../stores/debug';
import { addTokenUsage } from '../stores/llm';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type AgentStepType = 'tool_call' | 'tool_result' | 'done' | 'error';

export interface AgentStep {
  type: AgentStepType;
  tool?: string;
  args?: Record<string, unknown>;
  result?: string;
  text?: string;
}

export interface AgentOptions {
  onStep: (step: AgentStep) => void;
  /** Custom write handler — allows the caller to intercept file writes for undo support. */
  writeFile?: (path: string, content: string) => Promise<void>;
}

// ── Tool-Definitionen ─────────────────────────────────────────────────────────

const TOOL_LIST = [
  {
    name: 'list_files',
    description: 'Listet alle .md-Dateien in einem Vault-Verzeichnis. Pfade beginnen mit ./vault/',
    params: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Vault-Verzeichnis, z.B. ./vault/campaigns/meine-kampagne/acts/' },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_json_files',
    description:
      'Listet alle .json-Dateien in einem Vault-Verzeichnis. ' +
      'Verwenden für Encounter-Dateien (./vault/campaigns/{slug}/encounters/) ' +
      'und Monster-Bibliothek (./vault/monsters/).',
    params: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Vault-Verzeichnis, z.B. ./vault/campaigns/meine-kampagne/encounters/' },
      },
      required: ['path'],
    },
  },
  {
    name: 'read_file',
    description: 'Liest den vollständigen Inhalt einer Vault-Datei (Markdown oder JSON).',
    params: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Vault-Pfad zur Datei' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description:
      'Erstellt oder überschreibt eine Vault-Datei. Übergeordnete Verzeichnisse werden automatisch angelegt. ' +
      'Für .md-Dateien: vollständiges Markdown. ' +
      'Für .json-Dateien (Encounters, Monster): valides JSON im vorgegebenen Schema.',
    params: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Vault-Pfad der Datei (.md oder .json)' },
        content: { type: 'string', description: 'Vollständiger Dateiinhalt (Markdown oder JSON)' },
      },
      required: ['path', 'content'],
    },
  },
];

const VAULT_TOOLS_OPENAI = TOOL_LIST.map((t) => ({
  type: 'function',
  function: { name: t.name, description: t.description, parameters: t.params },
}));

const VAULT_TOOLS_ANTHROPIC = TOOL_LIST.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.params,
}));

// ── Tool-Ausführung (Tauri) ───────────────────────────────────────────────────

async function executeTool(
  name: string,
  args: Record<string, string>,
  writeFile?: (path: string, content: string) => Promise<void>
): Promise<string> {
  switch (name) {
    case 'list_files': {
      const files = await invoke<string[]>('list_directory', { path: args.path });
      return JSON.stringify(files);
    }
    case 'list_json_files': {
      const files = await invoke<string[]>('list_json_files', { path: args.path });
      return JSON.stringify(files);
    }
    case 'read_file': {
      return await invoke<string>('read_file_content', { path: args.path });
    }
    case 'write_file': {
      if (writeFile) {
        await writeFile(args.path, args.content);
      } else {
        await invoke('write_file_content', { path: args.path, content: args.content });
      }
      return `File saved: ${args.path}`;
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── HTTP via Rust ─────────────────────────────────────────────────────────────

interface DebugMeta { provider: string; label: string; }

function extractTokenUsage(provider: string, data: Record<string, unknown>): { sent: number; received: number } | null {
  if (provider === 'anthropic') {
    const u = data.usage as Record<string, number> | undefined;
    if (u?.input_tokens != null) return { sent: u.input_tokens, received: u.output_tokens ?? 0 };
  } else if (provider === 'groq' || provider === 'xai') {
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

export async function ollamaChat(config: LlmConfig, messages: ChatMessage[]): Promise<string> {
  const data = await rustFetch(
    `${config.baseUrl}/api/chat`, {},
    { model: config.model, messages, stream: false },
    { provider: 'ollama', label: 'chat' }
  ) as Record<string, unknown>;
  return (data.message as Record<string, string>)?.content ?? '';
}

export async function ollamaGenerate(config: LlmConfig, prompt: string, system?: string): Promise<string> {
  const body: Record<string, unknown> = { model: config.model, prompt, stream: false };
  if (system) body.system = system;
  const data = await rustFetch(`${config.baseUrl}/api/generate`, {}, body, { provider: 'ollama', label: 'generate' }) as Record<string, unknown>;
  return (data.response as string) ?? '';
}

// ── Groq ──────────────────────────────────────────────────────────────────────

const GROQ_API = 'https://api.groq.com/openai/v1';

export async function groqChat(config: LlmConfig, messages: ChatMessage[]): Promise<string> {
  if (!config.apiKey) throw new Error('Kein Groq API-Key konfiguriert. Bitte unter ⚙ eintragen.');
  const data = await rustFetch(
    `${GROQ_API}/chat/completions`,
    { Authorization: `Bearer ${config.apiKey}` },
    { model: config.model, messages },
    { provider: 'groq', label: 'chat' }
  ) as Record<string, unknown>;
  const choices = data.choices as Array<Record<string, unknown>>;
  return (choices?.[0]?.message as Record<string, string>)?.content ?? '';
}

export async function groqGenerate(config: LlmConfig, prompt: string, system?: string): Promise<string> {
  const messages: ChatMessage[] = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });
  return groqChat(config, messages);
}

// ── Anthropic ─────────────────────────────────────────────────────────────────

const ANTHROPIC_API = 'https://api.anthropic.com/v1';

export async function anthropicChat(config: LlmConfig, messages: ChatMessage[]): Promise<string> {
  if (!config.apiKey) throw new Error('Kein Anthropic API-Key konfiguriert. Bitte unter ⚙ eintragen.');
  const system = messages.find((m) => m.role === 'system')?.content;
  const conversation = messages.filter((m) => m.role !== 'system');
  const body: Record<string, unknown> = { model: config.model, max_tokens: 4096, messages: conversation };
  if (system) body.system = system;
  const data = await rustFetch(
    `${ANTHROPIC_API}/messages`,
    { 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' },
    body, { provider: 'anthropic', label: 'chat' }
  ) as Record<string, unknown>;
  return (data.content as Array<Record<string, string>>)?.[0]?.text ?? '';
}

export async function anthropicGenerate(config: LlmConfig, prompt: string, system?: string): Promise<string> {
  if (!config.apiKey) throw new Error('Kein Anthropic API-Key konfiguriert. Bitte unter ⚙ eintragen.');
  const body: Record<string, unknown> = { model: config.model, max_tokens: 4096, messages: [{ role: 'user', content: prompt }] };
  if (system) body.system = system;
  const data = await rustFetch(
    `${ANTHROPIC_API}/messages`,
    { 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' },
    body, { provider: 'anthropic', label: 'generate' }
  ) as Record<string, unknown>;
  return (data.content as Array<Record<string, string>>)?.[0]?.text ?? '';
}

// ── xAI (Grok) ────────────────────────────────────────────────────────────────

const XAI_API = 'https://api.x.ai/v1';

export async function xaiChat(config: LlmConfig, messages: ChatMessage[]): Promise<string> {
  if (!config.apiKey) throw new Error('Kein xAI API-Key konfiguriert. Bitte unter ⚙ eintragen.');
  const data = await rustFetch(
    `${XAI_API}/chat/completions`,
    { Authorization: `Bearer ${config.apiKey}` },
    { model: config.model, messages },
    { provider: 'xai', label: 'chat' }
  ) as Record<string, unknown>;
  const choices = data.choices as Array<Record<string, unknown>>;
  return (choices?.[0]?.message as Record<string, string>)?.content ?? '';
}

export async function xaiGenerate(config: LlmConfig, prompt: string, system?: string): Promise<string> {
  const messages: ChatMessage[] = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });
  return xaiChat(config, messages);
}

// ── Agentic Loop ──────────────────────────────────────────────────────────────

const AGENT_MAX_ITERATIONS = 12;

async function openAiAgentLoop(
  config: LlmConfig,
  apiBase: string,
  authHeader: Record<string, string>,
  userMessage: string,
  systemPromptText: string,
  options: AgentOptions
): Promise<string> {
  const { onStep, writeFile } = options;
  const msgs: unknown[] = [
    { role: 'system', content: systemPromptText },
    { role: 'user', content: userMessage },
  ];

  let toolUseFailedRetries = 0;

  for (let i = 0; i < AGENT_MAX_ITERATIONS; i++) {
    let data: Record<string, unknown>;
    try {
      data = await rustFetch(
        `${apiBase}/chat/completions`,
        authHeader,
        // parallel_tool_calls: false verbessert Zuverlässigkeit bei llama-Modellen erheblich
        { model: config.model, messages: msgs, tools: VAULT_TOOLS_OPENAI, parallel_tool_calls: false },
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
          result = await executeTool(toolName, toolArgs, writeFile);
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

async function anthropicAgentLoop(
  config: LlmConfig,
  userMessage: string,
  systemPromptText: string,
  options: AgentOptions
): Promise<string> {
  const { onStep, writeFile } = options;
  const msgs: unknown[] = [{ role: 'user', content: userMessage }];

  for (let i = 0; i < AGENT_MAX_ITERATIONS; i++) {
    const data = await rustFetch(
      `${ANTHROPIC_API}/messages`,
      { 'x-api-key': config.apiKey!, 'anthropic-version': '2023-06-01' },
      { model: config.model, max_tokens: 4096, system: systemPromptText, messages: msgs, tools: VAULT_TOOLS_ANTHROPIC },
      { provider: 'anthropic', label: `agent[${i}]` }
    ) as Record<string, unknown>;

    const stopReason = data.stop_reason as string;
    const content = data.content as Array<Record<string, unknown>>;

    msgs.push({ role: 'assistant', content });

    if (stopReason === 'end_turn') {
      const text = (content.find((b) => b.type === 'text')?.text as string) ?? '';
      onStep({ type: 'done', text });
      return text;
    }

    if (stopReason === 'tool_use') {
      const toolResults: unknown[] = [];
      for (const block of content.filter((b) => b.type === 'tool_use')) {
        const toolName = block.name as string;
        const toolArgs = block.input as Record<string, string>;
        const toolId = block.id as string;

        onStep({ type: 'tool_call', tool: toolName, args: toolArgs });
        let result: string;
        try {
          result = await executeTool(toolName, toolArgs, writeFile);
        } catch (e) {
          result = `Error: ${e instanceof Error ? e.message : String(e)}`;
        }
        onStep({ type: 'tool_result', tool: toolName, result });
        toolResults.push({ type: 'tool_result', tool_use_id: toolId, content: result });
      }
      msgs.push({ role: 'user', content: toolResults });
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
  options: AgentOptions
): Promise<string> {
  if (config.provider === 'anthropic') {
    if (!config.apiKey) throw new Error('No Anthropic API key configured.');
    return anthropicAgentLoop(config, userMessage, systemPromptText, options);
  }
  if (config.provider === 'groq') {
    if (!config.apiKey) throw new Error('No Groq API key configured.');
    return openAiAgentLoop(config, GROQ_API, { Authorization: `Bearer ${config.apiKey}` }, userMessage, systemPromptText, options);
  }
  if (config.provider === 'xai') {
    if (!config.apiKey) throw new Error('No xAI API key configured.');
    return openAiAgentLoop(config, XAI_API, { Authorization: `Bearer ${config.apiKey}` }, userMessage, systemPromptText, options);
  }
  throw new Error('Ollama does not support tool calling. Please use Groq, xAI, or Anthropic.');
}
