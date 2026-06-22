import type { LlmConfig, LlmProvider } from '../types';
import {
  ollamaChat,
  ollamaGenerate,
  groqChat,
  groqGenerate,
  xaiChat,
  xaiGenerate,
  qualitymindsChat,
  qualitymindsGenerate,
  anthropicChat,
  anthropicGenerate,
  agentLoop as agentLoopDispatch,
  modelSupportsTemperature,
} from './llmService';
import { TASK_TEMPERATURE } from './vaultTools';
import type { ChatMessage, AgentOptions, TaskKind } from './vaultTools';

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
  /** Konversation mit History. `task` wählt das Temperatur-Preset (Default: chat). */
  chat(messages: ChatMessage[], task?: TaskKind): Promise<string>;
  /** Einmaliger Output ohne History. `task` wählt das Temperatur-Preset. */
  generate(prompt: string, system?: string, task?: TaskKind): Promise<string>;
  /** Agentic Loop mit Vault-Tools. Nur vorhanden, wenn `capabilities.tools`. */
  agentLoop?(userMessage: string, systemPromptText: string, options: AgentOptions): Promise<string>;
}

/** Task-Kind → Temperatur-Preset. Der globale Override (config.temperature) gewinnt im Adapter. */
function tempFor(task?: TaskKind): number | undefined {
  return task ? TASK_TEMPERATURE[task] : undefined;
}

/** Capabilities der portablen, tool-fähigen OpenAI-kompatiblen Provider (Groq, xAI). */
const OPENAI_CAPS: LlmCapabilities = {
  tools: true,
  temperature: true,
  structuredOutput: false,
  promptCaching: false,
  thinking: false,
};

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
        agentLoop: (userMessage, systemPromptText, options) =>
          agentLoopDispatch(config, userMessage, systemPromptText, options),
      };

    case 'groq':
      return {
        provider: 'groq',
        capabilities: OPENAI_CAPS,
        chat: (messages, task) => groqChat(config, messages, tempFor(task)),
        generate: (prompt, system, task) => groqGenerate(config, prompt, system, tempFor(task)),
        agentLoop: (userMessage, systemPromptText, options) =>
          agentLoopDispatch(config, userMessage, systemPromptText, options),
      };

    case 'xai':
      return {
        provider: 'xai',
        capabilities: OPENAI_CAPS,
        chat: (messages, task) => xaiChat(config, messages, tempFor(task)),
        generate: (prompt, system, task) => xaiGenerate(config, prompt, system, tempFor(task)),
        agentLoop: (userMessage, systemPromptText, options) =>
          agentLoopDispatch(config, userMessage, systemPromptText, options),
      };

    case 'qualityminds':
      return {
        provider: 'qualityminds',
        capabilities: OPENAI_CAPS,
        chat: (messages, task) => qualitymindsChat(config, messages, tempFor(task)),
        generate: (prompt, system, task) => qualitymindsGenerate(config, prompt, system, tempFor(task)),
        agentLoop: (userMessage, systemPromptText, options) =>
          agentLoopDispatch(config, userMessage, systemPromptText, options),
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
