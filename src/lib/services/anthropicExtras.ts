/**
 * Claude-only-Fähigkeiten, bewusst AUSSERHALB des portablen `LlmClient`-Interface
 * (llmClient.ts). Die UI spricht sie nur an, wenn `client.capabilities.<flag>` true ist —
 * nie über den Providernamen. Die `@capability`-Zeilen nennen das jeweilige Flag.
 */
import type { LlmConfig } from '../types';
import type { ChatMessage } from './vaultTools';
import { createClient, createMessage, firstText, requireApiKey, DEFAULT_MAX_TOKENS } from './anthropicService';
import { stripJsonFence } from './jsonFence';

const NOT_IMPLEMENTED = (name: string) =>
  new Error(`anthropicExtras.${name} ist noch nicht implementiert.`);

/**
 * Erzwingt schema-valides JSON via `output_config.format`.
 * @capability structuredOutput
 */
export async function generateStructured<T>(
  config: LlmConfig,
  prompt: string,
  schema: object,
  system?: string,
  opts?: { signal?: AbortSignal },
): Promise<T> {
  const client = createClient(requireApiKey(config));
  const message = await createMessage(
    client,
    {
      model: config.model,
      max_tokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: prompt }],
      output_config: { format: { type: 'json_schema', schema: schema as Record<string, unknown> } },
    },
    'structured',
    opts?.signal,
  );
  return JSON.parse(stripJsonFence(firstText(message))) as T;
}

/**
 * Exaktes Token-Counting über `POST /v1/messages/count_tokens` statt der groben
 * usage-Schätzung. @capability — eigenes Flag bei Bedarf ergänzen.
 */
export async function countTokens(_config: LlmConfig, _messages: ChatMessage[]): Promise<number> {
  throw NOT_IMPLEMENTED('countTokens');
}

/**
 * Chat mit Prompt Caching (`cache_control: ephemeral`) auf dem stabilen Präfix.
 * Caching ist ein Präfix-Match — volatiler Inhalt muss ans Ende.
 * @capability promptCaching
 */
export async function chatCached(_config: LlmConfig, _messages: ChatMessage[]): Promise<string> {
  throw NOT_IMPLEMENTED('chatCached');
}
