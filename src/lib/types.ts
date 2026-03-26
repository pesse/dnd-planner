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
  type: 'campaign' | 'session' | 'npc' | 'world';
}

export type LlmProvider = 'ollama' | 'anthropic';

export interface LlmConfig {
  provider: LlmProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}
