/** Ollama: eigenes API-Format (`/api/chat`, `/api/generate`), kein Tool-Calling. */
import type { LlmConfig } from '../../types';
import type { ChatMessage } from '../vaultTools';
import { effTemp, rustFetch } from './transport';

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
