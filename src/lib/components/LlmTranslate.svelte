<script lang="ts">
  import { get } from 'svelte/store';
  import { llmConfig, loadApiKeyForProvider } from '../stores/llm';
  import { getClient } from '../services/llmClient';

  let {
    systemPrompt: defaultSystemPrompt,
    buildPrompt,
    onresult,
    label = 'Aus Original übersetzen',
  }: {
    systemPrompt: string;
    buildPrompt: () => string | null;
    onresult: (raw: string) => void;
    label?: string;
  } = $props();

  const PROVIDERS = [
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'groq',      label: 'Groq' },
    { value: 'ollama',    label: 'Ollama' },
    { value: 'xai',       label: 'xAI' },
  ] as const;

  const PROVIDER_DEFAULT_MODELS: Record<string, string> = {
    anthropic: 'claude-sonnet-4-6',
    groq:      'llama-3.3-70b-versatile',
    xai:       'grok-3-mini',
    ollama:    'llama3.2',
  };

  let translateProvider = $state(get(llmConfig).provider);
  let translateSystemPrompt = $state(defaultSystemPrompt);
  let showSystemPrompt = $state(false);
  let translating = $state(false);
  let translateError = $state('');

  async function translate() {
    const prompt = buildPrompt();
    if (!prompt) return;
    translating = true;
    translateError = '';
    try {
      const globalCfg = get(llmConfig);
      const apiKey = await loadApiKeyForProvider(translateProvider);
      const cfg = {
        provider: translateProvider as typeof globalCfg.provider,
        model:    translateProvider === globalCfg.provider
                    ? globalCfg.model
                    : (PROVIDER_DEFAULT_MODELS[translateProvider] ?? ''),
        apiKey:   apiKey ?? undefined,
        baseUrl:  globalCfg.baseUrl,
      };

      const raw = await getClient(cfg).generate(prompt, translateSystemPrompt, 'translate');
      onresult(raw);
    } catch (e) {
      translateError = e instanceof Error ? e.message : String(e);
    } finally {
      translating = false;
    }
  }
</script>

<div class="llt-section">
  <div class="llt-label-row">
    <span class="llt-label">{label}</span>
    <button class="llt-prompt-toggle" onclick={() => { showSystemPrompt = !showSystemPrompt; }}>
      System-Prompt {showSystemPrompt ? '▲' : '▼'}
    </button>
  </div>
  {#if showSystemPrompt}
    <textarea class="llt-prompt-textarea" bind:value={translateSystemPrompt} rows={4}></textarea>
    <button class="llt-reset-btn" onclick={() => { translateSystemPrompt = defaultSystemPrompt; }}>Zurücksetzen</button>
  {/if}
  <div class="llt-row">
    <div class="llt-pills">
      {#each PROVIDERS as p}
        <button class="llt-pill" class:active={translateProvider === p.value}
          onclick={() => { translateProvider = p.value; }}>{p.label}</button>
      {/each}
    </div>
    <button class="llt-btn" onclick={translate} disabled={translating}>
      {translating ? 'Übersetze…' : '🌐 Übersetzen'}
    </button>
  </div>
  {#if translateError}<span class="llt-error">{translateError}</span>{/if}
</div>

<style>
  .llt-section {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--surface);
    margin-top: 0.25rem;
  }

  .llt-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .llt-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-muted);
  }

  .llt-prompt-toggle {
    background: none;
    border: none;
    color: var(--border);
    font-size: 0.72rem;
    cursor: pointer;
    padding: 0;
    font-family: inherit;
  }
  .llt-prompt-toggle:hover { color: var(--cat-color, var(--red)); }

  .llt-prompt-textarea {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink-soft);
    font-size: 0.78rem;
    font-style: italic;
    line-height: 1.5;
    padding: 0.4rem 0.6rem;
    resize: vertical;
    outline: none;
    font-family: inherit;
    width: 100%;
  }
  .llt-prompt-textarea:focus { border-color: var(--cat-color, var(--red)); }

  .llt-reset-btn {
    background: none;
    border: none;
    color: var(--border);
    font-size: 0.72rem;
    cursor: pointer;
    padding: 0;
    font-family: inherit;
    align-self: flex-start;
  }
  .llt-reset-btn:hover { color: var(--danger); }

  .llt-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .llt-pills {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
    flex: 1;
  }

  .llt-pill {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 99px;
    color: var(--ink-muted);
    font-size: 0.75rem;
    padding: 0.2rem 0.6rem;
    cursor: pointer;
    white-space: nowrap;
    font-family: inherit;
  }
  .llt-pill:hover { color: var(--ink); border-color: var(--border-strong); }
  .llt-pill.active { background: var(--border); color: var(--ink); border-color: var(--cat-color, var(--red)); }

  .llt-btn {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink-soft);
    font-size: 0.8rem;
    padding: 0.2rem 0.65rem;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    font-family: inherit;
  }
  .llt-btn:hover:not(:disabled) { color: var(--cat-color, var(--red)); border-color: var(--cat-color, var(--red)); }
  .llt-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .llt-error { font-size: 0.78rem; color: var(--danger); }
</style>
