<script lang="ts">
  /** Formular für Anbieter, Modell, Key, Token- und Temperaturgrenzen der LLM-Konfiguration. */
  import { llmConfig, saveConfig, deleteApiKey, loadApiKeyForProvider } from '../../stores/llm';
  import { modelSupportsTemperature } from '../../services/anthropicService';
  import { ANTHROPIC_MODELS, GROQ_MODELS, QUALITYMINDS_MODELS, defaultModelFor, defaultBaseUrlFor } from '../../llmModels';

  let { onclose }: { onclose: () => void } = $props();

  let settingsProvider = $state($llmConfig.provider);
  let settingsModel = $state($llmConfig.model);
  let settingsBaseUrl = $state($llmConfig.baseUrl ?? 'http://localhost:11434');
  let settingsApiKey = $state($llmConfig.apiKey ?? '');
  let settingsMaxTokens = $state($llmConfig.maxTokens ?? 4096);
  // Temperature: optionaler globaler Override. Aus → Task-Presets je Kontext greifen.
  let settingsTempOverride = $state($llmConfig.temperature != null);
  let settingsTemperature = $state($llmConfig.temperature ?? 0.7);

  async function saveSettings() {
    await saveConfig({
      provider: settingsProvider,
      model: settingsModel,
      baseUrl: settingsProvider === 'ollama' ? settingsBaseUrl : undefined,
      apiKey: settingsProvider !== 'ollama' ? settingsApiKey : undefined,
      maxTokens: settingsMaxTokens,
      temperature: settingsTempOverride ? settingsTemperature : undefined,
    });
    onclose();
  }

  async function handleDeleteKey() {
    await deleteApiKey(settingsProvider);
    settingsApiKey = '';
  }

  async function onProviderChange() {
    settingsModel = defaultModelFor(settingsProvider);
    const url = defaultBaseUrlFor(settingsProvider);
    if (url) settingsBaseUrl = url;
    const stored = await loadApiKeyForProvider(settingsProvider);
    settingsApiKey = stored ?? '';
  }
</script>

<div class="settings-panel">
  <div class="settings-row">
    <label>Provider</label>
    <select bind:value={settingsProvider} onchange={onProviderChange}>
      <option value="ollama">Ollama (lokal)</option>
      <option value="groq">Groq (schnelle Inference)</option>
      <option value="anthropic">Anthropic (Claude)</option>
      <option value="qualityminds">QualityMinds (Qwen)</option>
    </select>
  </div>

  {#if settingsProvider === 'ollama'}
    <div class="settings-row">
      <label>Modell</label>
      <input type="text" bind:value={settingsModel} placeholder="llama3.2" />
    </div>
    <div class="settings-row">
      <label>URL</label>
      <input type="text" bind:value={settingsBaseUrl} placeholder="http://localhost:11434" />
    </div>
  {:else if settingsProvider === 'groq'}
    <div class="settings-row">
      <label>Modell</label>
      <select bind:value={settingsModel}>
        {#each GROQ_MODELS as m}
          <option value={m}>{m}</option>
        {/each}
      </select>
    </div>
    <div class="settings-row">
      <label>API-Key</label>
      <input type="password" bind:value={settingsApiKey} placeholder="gsk_..." />
    </div>
  {:else if settingsProvider === 'qualityminds'}
    <div class="settings-row">
      <label>Modell</label>
      <select bind:value={settingsModel}>
        {#each QUALITYMINDS_MODELS as m}
          <option value={m}>{m}</option>
        {/each}
      </select>
    </div>
    <div class="settings-row">
      <label>API-Key</label>
      <input type="password" bind:value={settingsApiKey} placeholder="sk-..." />
    </div>
  {:else}
    <div class="settings-row">
      <label>Modell</label>
      <select bind:value={settingsModel}>
        {#each ANTHROPIC_MODELS as m}
          <option value={m}>{m}</option>
        {/each}
      </select>
    </div>
    <div class="settings-row">
      <label>API-Key</label>
      <input type="password" bind:value={settingsApiKey} placeholder="sk-ant-..." />
    </div>
  {/if}

  <div class="settings-row">
    <label>Max Tokens</label>
    <input type="number" bind:value={settingsMaxTokens} min="256" max="32000" step="256" />
  </div>

  <div class="settings-row temp-row">
    <label class="temp-toggle">
      <input type="checkbox" bind:checked={settingsTempOverride} />
      Temperatur überschreiben
    </label>
    {#if settingsTempOverride}
      <input class="temp-value" type="number" bind:value={settingsTemperature} min="0" max="1" step="0.1" />
    {/if}
  </div>
  {#if settingsTempOverride}
    <p class="settings-hint">
      {#if settingsProvider === 'anthropic' && !modelSupportsTemperature(settingsModel)}
        ⚠ {settingsModel} ignoriert Temperatur — Steuerung erfolgt über effort/Prompting.
      {:else}
        Überschreibt die kontextabhängigen Presets (Übersetzung, Agent, …) global.
      {/if}
    </p>
  {/if}

  <div class="settings-footer">
    {#if settingsProvider !== 'ollama' && $llmConfig.apiKey}
      <button class="delete-key-btn" onclick={handleDeleteKey}>Key löschen</button>
    {/if}
    <button class="save-btn" onclick={saveSettings}>Speichern</button>
  </div>
</div>

<style>
  .settings-panel {
    background: var(--bg-deep);
    border-bottom: 1px solid var(--surface);
    padding: 0.6rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    flex-shrink: 0;
  }

  .settings-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .settings-row label {
    font-size: 0.7rem;
    color: var(--ink-muted);
    width: 52px;
    flex-shrink: 0;
  }

  .settings-row input,
  .settings-row select {
    flex: 1;
    background: var(--bg);
    border: 1px solid var(--surface);
    border-radius: 4px;
    color: var(--ink);
    padding: 0.25rem 0.4rem;
    font-size: 0.75rem;
    font-family: inherit;
    outline: none;
    min-width: 0;
  }

  .temp-toggle {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    width: auto;
    cursor: pointer;
  }

  .temp-toggle input[type='checkbox'] {
    flex: none;
    width: auto;
    min-width: 0;
    padding: 0;
    cursor: pointer;
  }

  .temp-value {
    flex: none !important;
    max-width: 64px;
  }

  .settings-hint {
    font-size: 0.65rem;
    color: var(--ink-muted);
    margin: 0.1rem 0 0;
    line-height: 1.3;
  }

  .settings-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.4rem;
    margin-top: 0.1rem;
  }

  .save-btn {
    background: var(--green);
    color: var(--bg);
    border: none;
    border-radius: 4px;
    padding: 0.25rem 0.8rem;
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
  }

  .delete-key-btn {
    background: transparent;
    color: var(--danger);
    border: 1px solid var(--danger);
    border-radius: 4px;
    padding: 0.25rem 0.6rem;
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
  }
</style>
