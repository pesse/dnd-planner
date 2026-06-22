/**
 * Claude-only-Features — dein Spielplatz für die Anthropic-API.
 *
 * Dieses Modul ist bewusst NICHT Teil des portablen `LlmClient`-Interface
 * (siehe llmClient.ts). Hier leben Fähigkeiten, die kein anderer Provider
 * (Ollama/Groq/xAI) bietet. Die UI spricht sie nur an, wenn
 * `client.capabilities.<flag>` true ist (also bei provider === 'anthropic').
 *
 * Implementierungs-Tipps:
 * - Das offizielle SDK ist bereits Dependency (@anthropic-ai/sdk).
 * - In anthropicService.ts gibt es bereits das Muster für einen Tauri-backed
 *   Client (`createClient`) + zentralen Aufruf-Wrapper (`createMessage`) mit
 *   Debug-Logging und Token-Tracking. Beides kannst du wiederverwenden bzw.
 *   exportieren, statt es hier zu duplizieren.
 *
 * Die Stubs werfen absichtlich, bis du sie implementierst.
 */
import type { LlmConfig } from '../types';
import type { ChatMessage } from './vaultTools';
import { createClient, createMessage, firstText, requireApiKey, DEFAULT_MAX_TOKENS } from './anthropicService';

const NOT_IMPLEMENTED = (name: string) =>
  new Error(`anthropicExtras.${name} ist noch nicht implementiert.`);

/**
 * Structured Outputs: erzwingt schema-valides JSON via `output_config.format`
 * (+ optional `strict: true` bei Tools). Ersetzt perspektivisch die fragile
 * Regex-Extraktion in LlmPanel (`extractJsonBlocks`) für Monster/Encounter.
 *
 * `schema` ist ein JSON-Schema (z.B. abgeleitet aus den Monster/Encounter-Types
 * in types.ts). Rückgabe ist das geparste, validierte Objekt.
 *
 * Doku: shared structured-outputs / `client.messages.parse()`.
 *
 * @capability structuredOutput
 */
export async function generateStructured<T>(
  config: LlmConfig,
  prompt: string,
  schema: object,
  system?: string,
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
  );
  return JSON.parse(firstText(message)) as T;
}

/**
 * Exaktes Token-Counting über `POST /v1/messages/count_tokens` (statt der
 * groben usage-Schätzung). Nützlich, um den Kampagnen-Kontext-Umfang vor dem
 * Senden zu messen.
 *
 * @capability — (eigenes Flag bei Bedarf ergänzen)
 */
export async function countTokens(_config: LlmConfig, _messages: ChatMessage[]): Promise<number> {
  throw NOT_IMPLEMENTED('countTokens');
}

/**
 * Chat mit Prompt Caching (`cache_control: ephemeral`) auf dem stabilen Präfix
 * (System-Prompt + großer, gleichbleibender Kampagnen-Kontext). Spart Kosten &
 * Latenz, sobald derselbe Kontext mehrfach gesendet wird.
 *
 * Wichtig: Caching ist ein Präfix-Match — volatiler Inhalt muss ans Ende.
 *
 * @capability promptCaching
 */
export async function chatCached(_config: LlmConfig, _messages: ChatMessage[]): Promise<string> {
  throw NOT_IMPLEMENTED('chatCached');
}
