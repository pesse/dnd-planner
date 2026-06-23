import { invoke } from '@tauri-apps/api/core';
import type Anthropic from '@anthropic-ai/sdk';

// ── Geteilte Typen (Chat & Agent) ─────────────────────────────────────────────

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
  /** Abort signal — wenn abgebrochen, wirft der Loop einen Fehler. */
  signal?: AbortSignal;
  /** Task-Temperatur für den Agent-Lauf (Default: TASK_TEMPERATURE.agent). */
  temperature?: number;
  /** Lebenszeichen: zu Beginn jeder Iteration und pro Streaming-Delta. Setzt die
   *  „Stuck"-Erkennung der UI nach jeder Antwort/Aktivität zurück. */
  onActivity?: () => void;
}

// ── Temperatur-Presets je Kontext ──────────────────────────────────────────────
// Pro Call-Site gewählt; ein gesetzter config.temperature überschreibt sie global.
// Hinweis: Auf Anthropic-Modellen ab Opus 4.7 (inkl. 4.8 / Fable 5) wird Temperature
// serverseitig ignoriert bzw. abgelehnt — dort steuert effort + Prompting (siehe anthropicService).

export const TASK_TEMPERATURE = {
  agent: 0.0,       // Tool-Calling — maximale Reproduzierbarkeit
  translate: 0.2,   // Übersetzung — nah am Original, deterministisch
  structured: 0.3,  // JSON-Generierung (Monster/Encounter) — wenig Streuung
  chat: 0.7,        // Konversation
  creative: 0.8,    // freie Generierung (NPCs, Story-Text)
} as const;

export type TaskKind = keyof typeof TASK_TEMPERATURE;

// ── Tool-Definitionen ─────────────────────────────────────────────────────────

interface ToolDef {
  name: string;
  description: string;
  params: Anthropic.Tool.InputSchema;
}

const TOOL_LIST: ToolDef[] = [
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

/** OpenAI-/Groq-/xAI-kompatibles Tool-Format (function calling). */
export const VAULT_TOOLS_OPENAI = TOOL_LIST.map((t) => ({
  type: 'function',
  function: { name: t.name, description: t.description, parameters: t.params },
}));

/** Anthropic-kompatibles Tool-Format. */
export const VAULT_TOOLS_ANTHROPIC: Anthropic.Tool[] = TOOL_LIST.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.params,
}));

// ── Generisches Toolset für den Agent-Loop ──────────────────────────────────
// Erlaubt es, denselben Loop mit anderen Tools (z.B. DnD-API) zu betreiben.

export interface AgentToolset {
  /** Anthropic-native Tool-Defs. */
  anthropicTools: Anthropic.Tool[];
  /** OpenAI-/Groq-/xAI-kompatible Tool-Defs. */
  openAiTools: unknown[];
  /** Führt einen Tool-Aufruf aus. `writeFile` ist nur für Vault-Tools relevant. */
  execute(
    name: string,
    args: Record<string, unknown>,
    writeFile?: (path: string, content: string) => Promise<void>
  ): Promise<string>;
}

/** Standard-Toolset: Vault-Dateioperationen (bisheriges Verhalten des Agent-Loops). */
export const VAULT_TOOLSET: AgentToolset = {
  anthropicTools: VAULT_TOOLS_ANTHROPIC,
  openAiTools: VAULT_TOOLS_OPENAI,
  execute: (name, args, writeFile) => executeTool(name, args as Record<string, string>, writeFile),
};

// ── Tool-Ausführung (Tauri) ─────────────────────────────────────────────────

export async function executeTool(
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
