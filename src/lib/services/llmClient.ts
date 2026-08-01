import type { LlmConfig, LlmProvider } from '../types';
import { ollamaChat, ollamaGenerate } from './llm/ollama';
import {
  groqChat,
  groqGenerate,
  qualitymindsChat,
  qualitymindsGenerate,
  qualitymindsGenerateStructured,
} from './llm/openAiCompatible';
import { agentLoop as agentLoopDispatch } from './llm/agentLoop';
import { anthropicChat, anthropicGenerate, modelSupportsTemperature } from './anthropicService';
import { generateStructured as anthropicGenerateStructured } from './anthropicExtras';
import { TASK_TEMPERATURE } from './vaultTools';
import type { ChatMessage, AgentOptions, TaskKind, AgentToolset } from './vaultTools';

/**
 * Was ein Provider in der konkreten Config kann. Die UI gated Features über DIESE Flags,
 * nie über den Providernamen. `tools`/`temperature` gehören zur portablen Schicht, die
 * übrigen markieren Claude-only-Features aus `anthropicExtras`.
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
 * Portable LLM-Fassade: alle Provider können `chat`/`generate`, alles Weitere ist optional
 * und genau dann gesetzt, wenn das zugehörige Capability-Flag es sagt. Claude-Spezifisches
 * gehört bewusst NICHT hierher, sondern in `anthropicExtras`.
 */
export interface LlmClient {
  readonly provider: LlmProvider;
  readonly capabilities: LlmCapabilities;
  /** `task` wählt das Temperatur-Preset (Default: chat), `onDelta` streamt — wo möglich. */
  chat(messages: ChatMessage[], task?: TaskKind, onDelta?: (delta: string) => void): Promise<string>;
  /** Ohne History; `task` und `onDelta` wie bei `chat`. */
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

/** Der einzige Ort mit Provider-Verzweigung — Consumer rufen `getClient(config).chat(…)`. */
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
