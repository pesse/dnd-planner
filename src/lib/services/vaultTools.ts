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
}

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
