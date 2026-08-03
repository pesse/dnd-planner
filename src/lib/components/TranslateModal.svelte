<script lang="ts" generics="T">
  import { onDestroy } from 'svelte';
  import { llmConfig } from '../stores/llm';
  import { runAiAction } from '../services/aiActions/runner';
  import { describeAiStep } from '../services/aiActions/describeStep';
  import Modal from './ui/Modal.svelte';
  import AiStatusBanner from './ui/AiStatusBanner.svelte';
  import LlmProviderSelect from './ui/LlmProviderSelect.svelte';
  import type { TranslationRun } from '../services/aiActions/translateAction';
  import type { AgentStep } from '../services/vaultTools';

  let {
    entityName,
    build,
    onresult,
    onclose,
  }: {
    entityName: string;
    /** Baut Aktion + Payload mit dem aktuellen Stand (pro Lauf neu aufgerufen). null = nichts zu übersetzen. */
    build: () => TranslationRun<T> | null;
    onresult: (result: T) => void;
    onclose: () => void;
  } = $props();

  let showSystemPrompt = $state(false);
  /** Read-only Vorschau: der Prompt entsteht aus Spec + Glossar-Pins zum aktuellen Draft. */
  let promptPreview = $state('');
  let running = $state(false);
  let error = $state('');
  let steps = $state<AgentStep[]>([]);
  let abort: AbortController | null = null;
  let userAborted = false;
  onDestroy(() => abort?.abort());

  function toggleSystemPrompt() {
    showSystemPrompt = !showSystemPrompt;
    if (showSystemPrompt) promptPreview = build()?.action.buildSystemPrompt() ?? '(nichts zu übersetzen)';
  }

  async function translate() {
    if (running) return;
    const run = build();
    if (!run) { error = 'Es gibt nichts zu übersetzen.'; return; }
    running = true;
    error = '';
    steps = [];
    userAborted = false;
    abort = new AbortController();
    try {
      const result = await runAiAction<T>($llmConfig, run.action, run.input, {
        onStep: (s) => { steps = [...steps, s]; },
        signal: abort.signal,
      });
      onresult(result);
      onclose();
    } catch (e) {
      if (!userAborted) error = e instanceof Error ? e.message : String(e);
    } finally {
      running = false;
      abort = null;
    }
  }

  function stop() {
    userAborted = true;
    abort?.abort();
  }
</script>

<Modal title="Übersetzen — {entityName}" label="Übersetzen" {onclose} contentClass="ai-modal">
  <LlmProviderSelect />

  <div class="row">
    <div class="prompt-label-row">
      <span class="field-label">Übersetzt Originalinhalt ins Deutsche</span>
      <button class="prompt-toggle" onclick={toggleSystemPrompt}>
        System-Prompt {showSystemPrompt ? '▲' : '▼'}
      </button>
    </div>
    {#if showSystemPrompt}
      <textarea class="textarea prompt-textarea" value={promptPreview} rows={4} readonly></textarea>
    {/if}
  </div>

  <div class="actions">
    {#if running}
      <div class="status-left"><AiStatusBanner text="Übersetze…" /></div>
      <button class="secondary-btn" onclick={stop}>Abbrechen</button>
    {:else}
      <button class="primary-btn" onclick={translate}>🌐 Übersetzen</button>
    {/if}
  </div>

  {#if steps.length}
    <div class="steps">
      {#each steps as s}
        {@const label = describeAiStep(s)}
        {#if label}
          <div class="step" class:muted={label.muted}>{label.icon} {label.text}</div>
        {/if}
      {/each}
    </div>
  {/if}

  {#if error}<p class="hint err">{error}</p>{/if}
</Modal>

<style>
  .prompt-label-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
  .prompt-toggle {
    background: none; border: none; color: var(--ink-muted); font-size: 0.72rem;
    cursor: pointer; padding: 0; font-family: inherit; white-space: nowrap;
  }
  .prompt-toggle:hover { color: var(--red); }
  .textarea.prompt-textarea { font-style: italic; font-size: 0.78rem; line-height: 1.5; }

  .actions { --actions-align: center; }
  .status-left { margin-right: auto; }
</style>
