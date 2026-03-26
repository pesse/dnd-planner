export interface Campaign {
  id: string;
  name: string;
  path: string;
}

export interface Session {
  id: string;
  title: string;
  path: string;
  date?: string;
}

export interface Npc {
  id: string;
  name: string;
  path: string;
}

export interface FileEntry {
  name: string;
  path: string;
  type: 'campaign' | 'act' | 'session' | 'npc' | 'world' | 'character';
  /** Set for directory-based characters (with PDF sheet) */
  dirPath?: string;
}

export type LlmProvider = 'ollama' | 'anthropic' | 'groq' | 'xai';

export interface LlmConfig {
  provider: LlmProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}
