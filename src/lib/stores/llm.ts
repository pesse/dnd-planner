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

/** Lädt den gespeicherten API-Key für einen bestimmten Provider aus dem OS-Keychain. */
export async function loadApiKeyForProvider(provider: LlmProvider): Promise<string | null> {
  return invoke<string | null>('load_api_key', { provider }).catch(() => null);
}

/** Lädt gespeicherte Provider-Einstellungen + API-Key des aktiven Providers beim App-Start. */
export async function loadSavedConfig(): Promise<void> {
  try {
    const saved = localStorage.getItem('llm-config');
    if (!saved) return;

    const { provider, model, baseUrl } = JSON.parse(saved) as Partial<LlmConfig>;
    if (!provider) return;

    const apiKey = await loadApiKeyForProvider(provider as LlmProvider);

    llmConfig.set({
      provider: provider as LlmProvider,
      model: model ?? 'llama3.2',
      baseUrl: baseUrl,
      apiKey: apiKey ?? undefined,
    });
  } catch {
    // Kein gespeicherter Config — Defaults bleiben
  }
}

/**
 * Speichert Provider/Modell/URL in localStorage und API-Key im OS-Keychain.
 * Leeres apiKey-Feld → bestehender Key im Keychain bleibt erhalten (nutze deleteApiKey zum Löschen).
 */
export async function saveConfig(config: LlmConfig): Promise<void> {
  localStorage.setItem(
    'llm-config',
    JSON.stringify({ provider: config.provider, model: config.model, baseUrl: config.baseUrl })
  );

  if (config.apiKey) {
    await invoke('save_api_key', { provider: config.provider, key: config.apiKey });
  }
  // Kein else: leeres Feld = Key nicht anfassen (separater "Key löschen" Button)

  llmConfig.set(config);
}

export async function deleteApiKey(provider: LlmProvider): Promise<void> {
  await invoke('delete_api_key', { provider });
  llmConfig.update((c) => ({ ...c, apiKey: undefined }));
}
