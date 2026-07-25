import type { LlmConfig, LlmProvider } from '../types';
import {
  ollamaChat,
  ollamaGenerate,
  groqChat,
  groqGenerate,
  qualitymindsChat,
  qualitymindsGenerate,
  qualitymindsGenerateStructured,
  anthropicChat,
  anthropicGenerate,
  agentLoop as agentLoopDispatch,
  modelSupportsTemperature,
} from './llmService';
import { generateStructured as anthropicGenerateStructured } from './anthropicExtras';
import { TASK_TEMPERATURE } from './vaultTools';
import type { ChatMessage, AgentOptions, TaskKind, AgentToolset } from './vaultTools';

/**
 * Capability-Deskriptor: was ein Provider (in der konkreten Config) kann.
 *
 * Diese Flags ersetzen die früher verstreuten `if (provider === …)`-Checks und
 * `throw`s. Die UI gated darüber Features (Agent-Tab, Claude-Panel, Temperatur-
 * Slider), statt Provider-Namen abzufragen.
 *
 * `tools`/`temperature` betreffen die **portable** Schicht; die übrigen Flags
 * markieren **Claude-only**-Features, deren Implementierung in `anthropicExtras`
 * lebt (nicht im LlmClient-Interface). Siehe dort.
 */
export interface LlmCapabilities {
  /** Tool-Calling / Agent-Loop verfügbar. Ollama: nein. */
  tools: boolean;
  /** Akzeptiert sampling-Parameter (temperature). Claude ab 4.7 / Fable 5: nein. */
  temperature: boolean;
  /** Claude-only: garantiert schema-valides JSON via output_config.format. */
  structuredOutput: boolean;
  /** Claude-only: Prompt Caching für großen, stabilen Kontext. */
  promptCaching: boolean;
  /** Claude-only: adaptive Thinking / Effort. */
  thinking: boolean;
}

/**
 * Portable LLM-Fassade. Alle Provider implementieren `chat`/`generate`;
 * `agentLoop` ist optional und nur gesetzt, wenn `capabilities.tools === true`.
 *
 * Bewusst NICHT enthalten: Claude-spezifische Fähigkeiten (Structured Outputs,
 * Prompt Caching, Token-Counting, Vision, …). Die leben in `anthropicExtras`
 * und werden von der UI nur bei `provider === 'anthropic'` angesprochen.
 */
export interface LlmClient {
  readonly provider: LlmProvider;
  readonly capabilities: LlmCapabilities;
  /** Konversation mit History. `task` wählt das Temperatur-Preset (Default: chat).
   *  `onDelta` (optional) erhält Token-Deltas live — nur bei streamenden Providern. */
  chat(messages: ChatMessage[], task?: TaskKind, onDelta?: (delta: string) => void): Promise<string>;
  /** Einmaliger Output ohne History. `task` wählt das Temperatur-Preset.
   *  `onDelta` (optional) erhält Token-Deltas live — nur bei streamenden Providern. */
  generate(prompt: string, system?: string, task?: TaskKind, onDelta?: (delta: string) => void): Promise<string>;
  /** Agentic Loop. `toolset` optional (Default: Vault-Tools). Nur vorhanden, wenn `capabilities.tools`. */
  agentLoop?(userMessage: string, systemPromptText: string, options: AgentOptions, toolset?: AgentToolset): Promise<string>;
  /** Natives, garantiert schema-valides JSON. Vorhanden gdw. `capabilities.structuredOutput`. */
  generateStructured?(prompt: string, schema: object, system?: string, opts?: { signal?: AbortSignal }): Promise<unknown>;
}

/** Task-Kind → Temperatur-Preset. Der globale Override (config.temperature) gewinnt im Adapter. */
function tempFor(task?: TaskKind): number | undefined {
  return task ? TASK_TEMPERATURE[task] : undefined;
}

/** Capabilities der portablen, tool-fähigen OpenAI-kompatiblen Provider (Groq, QualityMinds). */
const OPENAI_CAPS: LlmCapabilities = {
  tools: true,
  temperature: true,
  structuredOutput: false,
  promptCaching: false,
  thinking: false,
};

/**
 * QualityMinds läuft auf vllm mit nativem Structured Output (`structured_outputs.json`).
 * Groq bleibt bei OPENAI_CAPS (kein garantiertes json_schema über alle Modelle).
 */
const QUALITYMINDS_CAPS: LlmCapabilities = { ...OPENAI_CAPS, structuredOutput: true };

/**
 * Liefert den passenden LlmClient für eine Config. Einziger Ort mit Provider-
 * Verzweigung — Consumer rufen nur noch `getClient(config).chat(…)`.
 */
export function getClient(config: LlmConfig): LlmClient {
  switch (config.provider) {
    case 'anthropic':
      return {
        provider: 'anthropic',
        capabilities: {
          tools: true,
          temperature: modelSupportsTemperature(config.model),
          structuredOutput: true,
          promptCaching: true,
          thinking: true,
        },
        chat: (messages, task) => anthropicChat(config, messages, tempFor(task)),
        generate: (prompt, system, task) => anthropicGenerate(config, prompt, system, tempFor(task)),
        agentLoop: (userMessage, systemPromptText, options, toolset) =>
          agentLoopDispatch(config, userMessage, systemPromptText, options, toolset),
        generateStructured: (prompt, schema, system, opts) =>
          anthropicGenerateStructured(config, prompt, schema, system, opts),
      };

    case 'groq':
      return {
        provider: 'groq',
        capabilities: OPENAI_CAPS,
        chat: (messages, task, onDelta) => groqChat(config, messages, tempFor(task), onDelta),
        generate: (prompt, system, task, onDelta) => groqGenerate(config, prompt, system, tempFor(task), onDelta),
        agentLoop: (userMessage, systemPromptText, options, toolset) =>
          agentLoopDispatch(config, userMessage, systemPromptText, options, toolset),
      };

    case 'qualityminds':
      return {
        provider: 'qualityminds',
        capabilities: QUALITYMINDS_CAPS,
        chat: (messages, task, onDelta) => qualitymindsChat(config, messages, tempFor(task), onDelta),
        generate: (prompt, system, task, onDelta) => qualitymindsGenerate(config, prompt, system, tempFor(task), onDelta),
        agentLoop: (userMessage, systemPromptText, options, toolset) =>
          agentLoopDispatch(config, userMessage, systemPromptText, options, toolset),
        generateStructured: (prompt, schema, system, opts) =>
          qualitymindsGenerateStructured(config, prompt, schema, system, opts),
      };

    case 'ollama':
    default:
      return {
        provider: 'ollama',
        capabilities: {
          tools: false,
          temperature: true,
          structuredOutput: false,
          promptCaching: false,
          thinking: false,
        },
        chat: (messages, task) => ollamaChat(config, messages, tempFor(task)),
        generate: (prompt, system, task) => ollamaGenerate(config, prompt, system, tempFor(task)),
        // kein agentLoop — Ollama kann kein Tool Calling
      };
  }
}
