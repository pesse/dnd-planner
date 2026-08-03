<script lang="ts">
  /** Anbieter- und Modellwahl, die direkt in die gespeicherte LLM-Konfiguration schreibt. */
  import { llmConfig, saveConfig, loadApiKeyForProvider } from '../../stores/llm';
  import { modelsFor, defaultModelFor, defaultBaseUrlFor } from '../../llmModels';
  import type { LlmProvider } from '../../types';

  let { accent = 'red' }: { accent?: 'red' | 'arcane' } = $props();

  async function changeProvider(provider: LlmProvider) {
    const key = await loadApiKeyForProvider(provider);
    await saveConfig({
      ...$llmConfig,
      provider,
      model: defaultModelFor(provider),
      apiKey: key ?? undefined,
      baseUrl: defaultBaseUrlFor(provider),
    });
  }

  async function changeModel(model: string) {
    await saveConfig({ ...$llmConfig, model });
  }
</script>

<div class="row two" class:arcane={accent === 'arcane'}>
  <select class="select" value={$llmConfig.provider} onchange={(e) => changeProvider((e.target as HTMLSelectElement).value as LlmProvider)}>
    <option value="anthropic">Anthropic</option>
    <option value="groq">Groq</option>
    <option value="qualityminds">QualityMinds</option>
    <option value="ollama">Ollama</option>
  </select>
  {#if modelsFor($llmConfig.provider).length}
    <select class="select" value={$llmConfig.model} onchange={(e) => changeModel((e.target as HTMLSelectElement).value)}>
      {#each modelsFor($llmConfig.provider) as m}
        <option value={m}>{m}</option>
      {/each}
    </select>
  {:else}
    <input class="input" value={$llmConfig.model} onchange={(e) => changeModel((e.target as HTMLInputElement).value)} placeholder="Modell" />
  {/if}
</div>

<style>
  .row { display: flex; flex-direction: column; gap: 0.3rem; }
  .row.two { flex-direction: row; gap: 0.5rem; }
  .row.two > * { flex: 1; }

  .input:focus, .select:focus { border-color: var(--red); }
  .row.arcane .input:focus, .row.arcane .select:focus { border-color: var(--arcane, var(--red)); }
</style>
