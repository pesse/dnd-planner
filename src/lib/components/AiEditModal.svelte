<script lang="ts" generics="T">
  import { onDestroy } from 'svelte';
  import { llmConfig } from '../stores/llm';
  import { getClient } from '../services/llmClient';
  import { runAiAction } from '../services/aiActions/runner';
  import { describeAiStep } from '../services/aiActions/describeStep';
  import Modal from './ui/Modal.svelte';
  import AiStatusBanner from './ui/AiStatusBanner.svelte';
  import LlmProviderSelect from './ui/LlmProviderSelect.svelte';
  import { createRunClock } from '../utils/runClock.svelte';
  import type { AiAction } from '../services/aiActions/types';
  import type { AgentStep } from '../services/vaultTools';

  let {
    entityName,
    buildAction,
    onresult,
    onclose,
  }: {
    entityName: string;
    /** Baut die Aktion mit dem aktuellen Stand (wird pro Lauf neu aufgerufen). */
    buildAction: () => AiAction<T>;
    onresult: (revised: T) => void;
    onclose: () => void;
  } = $props();

  let instruction = $state('');
  let steps = $state<AgentStep[]>([]);
  let running = $state(false);
  let error = $state('');
  let abort: AbortController | null = null;
  let userAborted = false;
  let pendingRestart = false;

  const clock = createRunClock(() => running);
  onDestroy(() => abort?.abort());

  let client = $derived(getClient($llmConfig));
  let canTools = $derived(client.capabilities.tools);

  async function generate() {
    if (!instruction.trim() || running) return;
    running = true;
    error = '';
    steps = [];
    userAborted = false;
    abort = new AbortController();
    clock.start();
    try {
      const revised = await runAiAction<T>($llmConfig, buildAction(), instruction.trim(), {
        onStep: (s) => { steps = [...steps, s]; clock.touch(); },
        onActivity: () => clock.touch(),
        signal: abort.signal,
      });
      onresult(revised);
      onclose();
    } catch (e) {
      if (!userAborted) error = e instanceof Error ? e.message : String(e);
    } finally {
      clock.stop();
      running = false;
      abort = null;
      if (pendingRestart) { pendingRestart = false; generate(); }
    }
  }

  function stop() {
    userAborted = true;
    abort?.abort();
  }

  function retry() {
    pendingRestart = true;
    userAborted = true;
    abort?.abort();
  }
</script>

<Modal title="Per KI überarbeiten — {entityName}" label="Per KI überarbeiten" {onclose} contentClass="ai-modal">
  <LlmProviderSelect />

  {#if !canTools}
    <p class="hint warn">Das gewählte Modell unterstützt keine Tools. Bitte ein Anthropic- oder Groq-Modell wählen.</p>
  {/if}

  <div class="row">
    <label class="field-label" for="ai-instruction-input">Änderungswunsch</label>
    <textarea
      id="ai-instruction-input"
      class="textarea"
      bind:value={instruction}
      rows="3"
      placeholder="z.B. Werte für Herausforderungsgrad 5 hochskalieren, eine Aktion ergänzen"
    ></textarea>
  </div>

  <div class="actions">
    {#if running}
      {#if clock.stalled}
        <button class="secondary-btn" onclick={retry}>Neu versuchen</button>
      {/if}
      <button class="secondary-btn" onclick={stop}>Abbrechen</button>
    {:else}
      <button class="primary-btn" onclick={generate} disabled={!instruction.trim() || !canTools}>Überarbeiten</button>
    {/if}
  </div>

  {#if running}
    <AiStatusBanner text="KI arbeitet… ({clock.elapsedSec}s)" />
  {/if}

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

  {#if clock.stalled}
    <p class="hint warn">Seit {clock.stalledSec}s keine Antwort — Verbindung oder Modell hängt evtl. Du kannst neu versuchen oder abbrechen.</p>
  {/if}

  {#if error}<p class="hint err">{error}</p>{/if}
</Modal>
