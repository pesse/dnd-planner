<script lang="ts" generics="T">
  import { onDestroy } from 'svelte';
  import { llmConfig, saveConfig, loadApiKeyForProvider } from '../stores/llm';
  import { runAiAction } from '../services/aiActions/runner';
  import { describeAiStep } from '../services/aiActions/describeStep';
  import type { TranslationRun } from '../services/aiActions/translateAction';
  import { modelsFor, defaultModelFor, defaultBaseUrlFor } from '../llmModels';
  import type { LlmProvider } from '../types';
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

  // ── Verschiebbarer, nicht-blockierender Dialog ──────────────────────────────
  let pos = $state({ x: Math.max(16, window.innerWidth / 2 - 280), y: 80 });
  let dragOff = { x: 0, y: 0 };
  let dragging = false;

  function startDrag(e: MouseEvent) {
    dragging = true;
    dragOff = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    window.addEventListener('mousemove', onDrag);
    window.addEventListener('mouseup', endDrag);
    e.preventDefault();
  }
  function onDrag(e: MouseEvent) {
    if (!dragging) return;
    pos = {
      x: Math.min(Math.max(0, e.clientX - dragOff.x), window.innerWidth - 80),
      y: Math.min(Math.max(0, e.clientY - dragOff.y), window.innerHeight - 40),
    };
  }
  function endDrag() {
    dragging = false;
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('mouseup', endDrag);
  }
  onDestroy(endDrag);

  // ── KI-Pfad ───────────────────────────────────────────────────────────────
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

<div class="dialog" style="left: {pos.x}px; top: {pos.y}px;" role="dialog" aria-label="Übersetzen">
  <div class="modal-header" onmousedown={startDrag} role="presentation">
    <span class="modal-title">Übersetzen — {entityName}</span>
    <button class="close-btn" onmousedown={(e) => e.stopPropagation()} onclick={onclose} title="Schließen">×</button>
  </div>

  <div class="row two">
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
      <div class="ai-status"><span class="spinner" aria-hidden="true"></span><span>Übersetze…</span></div>
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
</div>

<style>
  .dialog {
    position: fixed;
    width: min(560px, 92vw);
    max-height: 84vh;
    overflow-y: auto;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0 1.1rem 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
    z-index: 1000;
  }
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: grab;
    user-select: none;
    margin: 0 -1.1rem 0.2rem;
    padding: 0.6rem 1.1rem;
    border-bottom: 1px solid var(--surface);
    position: sticky;
    top: 0;
    background: var(--bg);
  }
  .modal-header:active { cursor: grabbing; }
  .modal-title { font-weight: 700; font-size: 1rem; color: var(--ink); }
  .close-btn { background: none; border: none; color: var(--ink-muted); font-size: 1.3rem; cursor: pointer; line-height: 1; }
  .close-btn:hover { color: var(--ink); }

  .row { display: flex; flex-direction: column; gap: 0.3rem; }
  .row.two { flex-direction: row; gap: 0.5rem; }
  .row.two > * { flex: 1; }
  .field-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-muted); }

  .prompt-label-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
  .prompt-toggle {
    background: none; border: none; color: var(--ink-muted); font-size: 0.72rem;
    cursor: pointer; padding: 0; font-family: inherit; white-space: nowrap;
  }
  .prompt-toggle:hover { color: var(--red); }
  .prompt-textarea { font-style: italic; font-size: 0.78rem; line-height: 1.5; }

  .input, .select, .textarea {
    background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
    color: var(--ink); font-size: 0.85rem; padding: 0.35rem 0.5rem; outline: none; font-family: inherit; width: 100%;
  }
  .input:focus, .select:focus, .textarea:focus { border-color: var(--red); }
  .textarea { resize: vertical; }

  .actions { display: flex; justify-content: flex-end; align-items: center; gap: 0.5rem; }
  .primary-btn {
    background: var(--red); border: none; border-radius: 4px; color: #fff;
    padding: 0.35rem 0.9rem; cursor: pointer; font-family: inherit; font-size: 0.85rem;
  }
  .primary-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .secondary-btn {
    background: var(--surface); border: 1px solid var(--border); border-radius: 4px; color: var(--ink-soft);
    padding: 0.35rem 0.9rem; cursor: pointer; font-family: inherit; font-size: 0.85rem;
  }

  .steps { display: flex; flex-direction: column; gap: 0.2rem; max-height: 160px; overflow-y: auto; padding: 0.3rem 0; }
  .step { font-size: 0.78rem; color: var(--ink-soft); }
  .step.muted { color: var(--ink-muted); }

  .ai-status { display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; color: var(--ink-soft); margin-right: auto; }
  .spinner {
    width: 0.9rem; height: 0.9rem; flex-shrink: 0;
    border: 2px solid var(--surface); border-top-color: var(--red); border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .hint { font-size: 0.78rem; margin: 0; }
  .hint.err { color: var(--danger); }
</style>
