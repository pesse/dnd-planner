/**
 * Zentrale Modell-Listen pro Provider — genutzt vom LlmPanel und vom
 * KI-Aktions-Dialog (geteilte Quelle, keine Duplikate).
 */
import type { LlmProvider } from './types';

export const ANTHROPIC_MODELS = [
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
];

export const GROQ_MODELS = [
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'qwen/qwen3-32b',
  'llama-3.1-8b-instant',
];

/** QualityMinds (OpenAI-kompatibler vLLM-Endpunkt, feste URL in llmService). */
export const QUALITYMINDS_MODELS = [
  'cyankiwi/Qwen3.6-35B-A3B-AWQ-4bit',
];

/** Modell-Liste für einen Provider (leer bei Ollama → Freitext-Eingabe). */
export function modelsFor(provider: LlmProvider): string[] {
  if (provider === 'anthropic') return ANTHROPIC_MODELS;
  if (provider === 'groq') return GROQ_MODELS;
  if (provider === 'qualityminds') return QUALITYMINDS_MODELS;
  return [];
}

/** Default-Modell beim Provider-Wechsel. */
export function defaultModelFor(provider: LlmProvider): string {
  if (provider === 'anthropic') return 'claude-sonnet-4-6';
  if (provider === 'groq') return 'openai/gpt-oss-20b';
  if (provider === 'qualityminds') return QUALITYMINDS_MODELS[0];
  return 'llama3.2';
}

/** Default-Base-URL beim Provider-Wechsel (nur Ollama; Cloud-Provider haben feste URLs im Code). */
export function defaultBaseUrlFor(provider: LlmProvider): string | undefined {
  if (provider === 'ollama') return 'http://localhost:11434';
  return undefined;
}
