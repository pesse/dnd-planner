import { invoke } from '@tauri-apps/api/core';
import type { LlmConfig } from '../types';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** HTTP-Request via Rust/reqwest — umgeht WebView CORS/TLS-Probleme zuverlässig. */
async function rustFetch(
  url: string,
  headers: Record<string, string>,
  body: unknown
): Promise<unknown> {
  const text = await invoke<string>('http_request', {
    req: {
      url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    },
  });
  return JSON.parse(text);
}

// ── Ollama ────────────────────────────────────────────────────────────────────

export async function ollamaChat(config: LlmConfig, messages: ChatMessage[]): Promise<string> {
  const data = await rustFetch(
    `${config.baseUrl}/api/chat`,
    {},
    { model: config.model, messages, stream: false }
  ) as Record<string, unknown>;
  return (data.message as Record<string, string>)?.content ?? '';
}

export async function ollamaGenerate(
  config: LlmConfig,
  prompt: string,
  system?: string
): Promise<string> {
  const body: Record<string, unknown> = { model: config.model, prompt, stream: false };
  if (system) body.system = system;
  const data = await rustFetch(`${config.baseUrl}/api/generate`, {}, body) as Record<string, unknown>;
  return (data.response as string) ?? '';
}

// ── Groq ──────────────────────────────────────────────────────────────────────

const GROQ_API = 'https://api.groq.com/openai/v1';

export async function groqChat(config: LlmConfig, messages: ChatMessage[]): Promise<string> {
  if (!config.apiKey) throw new Error('Kein Groq API-Key konfiguriert. Bitte unter ⚙ eintragen.');
  const data = await rustFetch(
    `${GROQ_API}/chat/completions`,
    { Authorization: `Bearer ${config.apiKey}` },
    { model: config.model, messages }
  ) as Record<string, unknown>;
  const choices = data.choices as Array<Record<string, unknown>>;
  return (choices?.[0]?.message as Record<string, string>)?.content ?? '';
}

export async function groqGenerate(
  config: LlmConfig,
  prompt: string,
  system?: string
): Promise<string> {
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
    body
  ) as Record<string, unknown>;
  const content = data.content as Array<Record<string, string>>;
  return content?.[0]?.text ?? '';
}

export async function anthropicGenerate(
  config: LlmConfig,
  prompt: string,
  system?: string
): Promise<string> {
  if (!config.apiKey) throw new Error('Kein Anthropic API-Key konfiguriert. Bitte unter ⚙ eintragen.');
  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  };
  if (system) body.system = system;
  const data = await rustFetch(
    `${ANTHROPIC_API}/messages`,
    { 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' },
    body
  ) as Record<string, unknown>;
  const content = data.content as Array<Record<string, string>>;
  return content?.[0]?.text ?? '';
}
