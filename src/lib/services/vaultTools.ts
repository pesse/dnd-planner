import { invoke } from '@tauri-apps/api/core';
import type Anthropic from '@anthropic-ai/sdk';
import { toolDefsToAnthropic, toolDefsToOpenAi, type ToolDef } from './toolDef';

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
  /** Fängt Schreibzugriffe ab — der Aufrufer braucht sie für sein Undo. */
  writeFile?: (path: string, content: string) => Promise<void>;
  /** Abort signal — wenn abgebrochen, wirft der Loop einen Fehler. */
  signal?: AbortSignal;
  /** Task-Temperatur für den Agent-Lauf (Default: TASK_TEMPERATURE.agent). */
  temperature?: number;
  /** Setzt die „Stuck"-Erkennung der UI zurück; feuert pro Iteration und Streaming-Delta. */
  onActivity?: () => void;
}

// ── Temperatur-Presets je Kontext ──────────────────────────────────────────────

/**
 * Pro Call-Site gewählt; ein gesetzter `config.temperature` überschreibt sie global.
 * Anthropic ab Opus 4.7 ignoriert Temperature serverseitig — dort steuert effort.
 */
export const TASK_TEMPERATURE = {
  agent: 0.0,       // Tool-Calling — maximale Reproduzierbarkeit
  structured: 0.3,  // JSON-Generierung (Monster/Encounter/Übersetzung) — wenig Streuung
  chat: 0.7,        // Konversation
  creative: 0.8,    // freie Generierung (NPCs, Story-Text)
} as const;

export type TaskKind = keyof typeof TASK_TEMPERATURE;

// ── Tool-Definitionen ─────────────────────────────────────────────────────────

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

export const VAULT_TOOLS_OPENAI = toolDefsToOpenAi(TOOL_LIST);
export const VAULT_TOOLS_ANTHROPIC = toolDefsToAnthropic(TOOL_LIST);

// ── Generisches Toolset für den Agent-Loop ──────────────────────────────────

/** Damit derselbe Loop auch mit anderen Tools (z.B. der DnD-API) läuft. */
export interface AgentToolset {
  anthropicTools: Anthropic.Tool[];
  openAiTools: unknown[];
  /** Führt einen Tool-Aufruf aus. `writeFile` ist nur für Vault-Tools relevant. */
  execute(
    name: string,
    args: Record<string, unknown>,
    writeFile?: (path: string, content: string) => Promise<void>
  ): Promise<string>;
}

export const VAULT_TOOLSET: AgentToolset = {
  anthropicTools: VAULT_TOOLS_ANTHROPIC,
  openAiTools: VAULT_TOOLS_OPENAI,
  execute: (name, args, writeFile) => executeTool(name, args as Record<string, string>, writeFile),
};

/**
 * Delegiert `execute` der Reihe nach: ein Sub-Executor wirft bei unbekanntem Namen einen
 * „Unknown …"-Fehler, dann kommt das nächste Set. Tool-Namen müssen also EINDEUTIG sein.
 */
export function composeToolsets(...sets: AgentToolset[]): AgentToolset {
  return {
    anthropicTools: sets.flatMap((s) => s.anthropicTools),
    openAiTools: sets.flatMap((s) => s.openAiTools),
    async execute(name, args, writeFile) {
      for (const s of sets) {
        try {
          return await s.execute(name, args, writeFile);
        } catch (e) {
          if (e instanceof Error && /^Unknown (tool|DnD tool|rules tool):/i.test(e.message)) continue;
          throw e;
        }
      }
      throw new Error(`Unknown tool: ${name}`);
    },
  };
}

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
