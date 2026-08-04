import { writable } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import type { LlmConfig, LlmProvider } from '../types';

export const llmConfig = writable<LlmConfig>({
  provider: 'ollama',
  model: 'llama3.2',
  baseUrl: 'http://localhost:11434',
});

export const llmLoading = writable<boolean>(false);
export const llmMessages = writable<{ role: 'user' | 'assistant'; content: string }[]>([]);

export interface TokenUsage { sent: number; received: number; }

export const tokenStats = writable<{ last: TokenUsage; session: TokenUsage }>({
  last:    { sent: 0, received: 0 },
  session: { sent: 0, received: 0 },
});

export function addTokenUsage(usage: TokenUsage): void {
  tokenStats.update((s) => ({
    last: usage,
    session: { sent: s.session.sent + usage.sent, received: s.session.received + usage.received },
  }));
}

export function resetTokenStats(): void {
  tokenStats.set({ last: { sent: 0, received: 0 }, session: { sent: 0, received: 0 } });
}

/** Der Key liegt im OS-Keychain, nicht neben der übrigen Config im localStorage. */
export async function loadApiKeyForProvider(provider: LlmProvider): Promise<string | null> {
  return invoke<string | null>('load_api_key', { provider }).catch(() => null);
}

export async function loadSavedConfig(): Promise<void> {
  try {
    const saved = localStorage.getItem('llm-config');
    if (!saved) return;

    const { provider, model, baseUrl, maxTokens, temperature } = JSON.parse(saved) as Partial<LlmConfig>;
    if (!provider) return;

    const apiKey = await loadApiKeyForProvider(provider as LlmProvider);

    llmConfig.set({
      provider: provider as LlmProvider,
      model: model ?? 'llama3.2',
      baseUrl: baseUrl,
      apiKey: apiKey ?? undefined,
      maxTokens: maxTokens,
      temperature: temperature,
    });
  } catch {
    // Kein gespeicherter Config — Defaults bleiben
  }
}

/** Leeres apiKey-Feld → der Key im Keychain bleibt; gelöscht wird nur über `deleteApiKey`. */
export async function saveConfig(config: LlmConfig): Promise<void> {
  localStorage.setItem(
    'llm-config',
    JSON.stringify({ provider: config.provider, model: config.model, baseUrl: config.baseUrl, maxTokens: config.maxTokens, temperature: config.temperature })
  );

  if (config.apiKey) {
    await invoke('save_api_key', { provider: config.provider, key: config.apiKey });
  }

  llmConfig.set(config);
}

export async function deleteApiKey(provider: LlmProvider): Promise<void> {
  await invoke('delete_api_key', { provider });
  llmConfig.update((c) => ({ ...c, apiKey: undefined }));
}
