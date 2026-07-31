/**
 * Groq und QualityMinds: identische Technik (OpenAI `/chat/completions`), getrennte
 * Identität — eigene Base-URL, eigener Keychain-Slot, eigenes UI-Label.
 */
import type { LlmConfig } from '../../types';
import { TASK_TEMPERATURE } from '../vaultTools';
import type { ChatMessage } from '../vaultTools';
import { stripJsonFence } from '../jsonFence';
import { effTemp, rustFetchStream } from './transport';

export const GROQ_API = 'https://api.groq.com/openai/v1';
export const QUALITYMINDS_API = 'https://code.qualityminds.ai/v1';

/** Gemeinsame Chat-Implementierung. `apiBase` + Key bestimmen den konkreten Provider. */
async function openAiCompatChat(config: LlmConfig, apiBase: string, messages: ChatMessage[], temperature?: number, onDelta?: (delta: string) => void, guidedJsonSchema?: object, signal?: AbortSignal, onReasoning?: (delta: string) => void, noThinking = false): Promise<string> {
  if (!config.apiKey) throw new Error(`Kein API-Key für ${config.provider} konfiguriert. Bitte unter ⚙ eintragen.`);
  const temp = effTemp(config, temperature);
  const { content } = await rustFetchStream(
    `${apiBase}/chat/completions`,
    { Authorization: `Bearer ${config.apiKey}` },
    {
      model: config.model,
      messages,
      ...(temp != null ? { temperature: temp } : {}),
      // Obergrenze mitschicken, wenn konfiguriert — sonst kann eine davonlaufende
      // Generierung (v.a. unter guided decoding, wo „noch ein Array-Element" stets
      // erlaubt ist) bis ins Client-Timeout laufen.
      ...(config.maxTokens != null ? { max_tokens: config.maxTokens } : {}),
      // vllm-native guided decoding: Schema als `structured_outputs.json` (die
      // `extra_body`-Variante, die über REST top-level steht). Greift auf diesem
      // Server NUR mit abgeschaltetem Thinking — sonst verbraucht das Reasoning das
      // Budget und die Grammatik wird nicht angewandt (per Server-Probe 2026-07-24
      // verifiziert: nur `enable_thinking:false` erzwingt das Schema).
      // `noThinking` schaltet denselben Server-Schalter OHNE Schema ab: für Calls, deren
      // Aufgabe kein Denken braucht (Merkmals-Analyse — sie findet Entscheidungen, sie
      // zählt nichts mehr auf). Bewusst je Call und nicht global: der Agent-Loop und die
      // übrigen Aktionen behalten ihren Vorlauf.
      ...(guidedJsonSchema
        ? { structured_outputs: { json: guidedJsonSchema }, chat_template_kwargs: { enable_thinking: false } }
        : noThinking
          ? { chat_template_kwargs: { enable_thinking: false } }
          : {}),
    },
    { provider: config.provider, label: 'chat' },
    onDelta,
    signal,
    onReasoning,
  );
  return content;
}

function withSystem(prompt: string, system?: string): ChatMessage[] {
  const messages: ChatMessage[] = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });
  return messages;
}

function openAiCompatGenerate(config: LlmConfig, apiBase: string, prompt: string, system?: string, temperature?: number, onDelta?: (delta: string) => void, guidedJsonSchema?: object): Promise<string> {
  return openAiCompatChat(config, apiBase, withSystem(prompt, system), temperature, onDelta, guidedJsonSchema);
}

export const groqChat = (c: LlmConfig, m: ChatMessage[], t?: number, onDelta?: (d: string) => void) => openAiCompatChat(c, GROQ_API, m, t, onDelta);
export const groqGenerate = (c: LlmConfig, p: string, s?: string, t?: number, onDelta?: (d: string) => void) => openAiCompatGenerate(c, GROQ_API, p, s, t, onDelta);

export const qualitymindsChat = (c: LlmConfig, m: ChatMessage[], t?: number, onDelta?: (d: string) => void, signal?: AbortSignal, onReasoning?: (d: string) => void, noThinking?: boolean) => openAiCompatChat(c, QUALITYMINDS_API, m, t, onDelta, undefined, signal, onReasoning, noThinking);
export const qualitymindsGenerate = (c: LlmConfig, p: string, s?: string, t?: number, onDelta?: (d: string) => void) => openAiCompatGenerate(c, QUALITYMINDS_API, p, s, t, onDelta);

/**
 * Natives Structured Output über QM/vllm via `structured_outputs.json` (guided
 * decoding). Pendant zu `anthropicExtras.generateStructured`; gibt das geparste
 * Objekt zurück.
 */
export async function qualitymindsGenerateStructured(
  config: LlmConfig,
  prompt: string,
  schema: object,
  system?: string,
  opts?: { signal?: AbortSignal },
): Promise<unknown> {
  return qualitymindsGenerateStructuredFromMessages(config, withSystem(prompt, system), schema, opts);
}

/**
 * Wie `qualitymindsGenerateStructured`, aber über einen vollen Chat-Verlauf statt eines
 * Einzel-Prompts. Für den Dreipass der Merkmals-Effekte: Pass A (Thinking) liefert eine
 * Analyse, die hier als `assistant`-Turn mitgeschickt wird, und dieser guided Call gießt
 * sie ins Schema (`enable_thinking:false` erzwingt die Grammatik).
 */
export async function qualitymindsGenerateStructuredFromMessages(
  config: LlmConfig,
  messages: ChatMessage[],
  schema: object,
  opts?: { signal?: AbortSignal },
): Promise<unknown> {
  const content = await openAiCompatChat(
    config,
    QUALITYMINDS_API,
    messages,
    TASK_TEMPERATURE.structured,
    undefined,
    schema,
    opts?.signal,
  );
  return JSON.parse(stripJsonFence(content));
}

/**
 * Roher `/chat/completions`-Call gegen einen OpenAI-kompatiblen Provider (QualityMinds,
 * Groq, eigener `baseUrl`): Messages + BELIEBIGE Body-Properties, unverändert
 * durchgereicht.
 *
 * Zweck ist die **Prompt-Werkstatt der Evals** (`evals/promptCase.ts`): einen Prompt-
 * Entwurf samt Server-Parametern (`structured_outputs`, `chat_template_kwargs`,
 * `top_p`, …) messen, BEVOR er als `AiAction` in die App wandert. Bewusst hier und
 * nicht im Eval-Ordner, damit dieselbe Transport-Schicht greift — inkl. Streaming,
 * Rate-Limit-Retry, Token-Zählung und Debug-Mitschnitt (den der Report ausliest).
 *
 * `extraBody` gewinnt gegen die Defaults aus der Config (model/temperature/max_tokens).
 * Die App selbst ruft das nicht auf; Produktionspfade gehen über die Action-Ebene.
 */
export async function rawChatCompletion(
  config: LlmConfig,
  messages: ChatMessage[],
  extraBody: Record<string, unknown> = {},
  opts: { label?: string; signal?: AbortSignal } = {},
): Promise<{ content: string; finishReason: string }> {
  // Ein explizit gesetzter baseUrl gewinnt (eigener/lokaler OpenAI-kompatibler Server),
  // sonst die Standard-Basis des Providers.
  const apiBase =
    config.baseUrl ||
    (config.provider === 'groq' ? GROQ_API : config.provider === 'qualityminds' ? QUALITYMINDS_API : undefined);
  if (!apiBase) {
    throw new Error(
      `rawChatCompletion unterstützt nur OpenAI-kompatible Provider ` +
        `(qualityminds, groq oder ein eigener baseUrl) — nicht "${config.provider}".`,
    );
  }
  if (!config.apiKey) throw new Error(`Kein API-Key für ${config.provider} konfiguriert.`);
  const temp = effTemp(config);
  const { content, finishReason } = await rustFetchStream(
    `${apiBase}/chat/completions`,
    { Authorization: `Bearer ${config.apiKey}` },
    {
      model: config.model,
      messages,
      ...(temp != null ? { temperature: temp } : {}),
      ...(config.maxTokens != null ? { max_tokens: config.maxTokens } : {}),
      ...extraBody,
    },
    { provider: config.provider, label: opts.label ?? 'raw' },
    undefined,
    opts.signal,
  );
  return { content, finishReason };
}
