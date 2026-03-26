import { writable } from 'svelte/store';
import type { LlmConfig } from '../types';

export const llmConfig = writable<LlmConfig>({
  provider: 'ollama',
  model: 'llama3.2',
  baseUrl: 'http://localhost:11434',
});

export const llmLoading = writable<boolean>(false);
export const llmMessages = writable<{ role: 'user' | 'assistant'; content: string }[]>([]);
