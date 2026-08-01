<script lang="ts">
  import { onDestroy } from 'svelte';
  import { llmConfig } from '../stores/llm';
  import { getClient } from '../services/llmClient';
  import { describeAiStep } from '../services/aiActions/describeStep';
  import { activeFile, fileContent } from '../stores/campaign';
  import { monsterLibrary, campaignCharacterData, contextFlags } from '../stores/context';
  import { monsterTypeLabel } from '../types';
  import Modal from './ui/Modal.svelte';
  import AiStatusBanner from './ui/AiStatusBanner.svelte';
  import LlmProviderSelect from './ui/LlmProviderSelect.svelte';
  import { createRunClock } from '../utils/runClock.svelte';
  import type { AgentStep } from '../services/vaultTools';
  import type { ContextAction } from '../services/contextActions';

  let { action, onclose }: { action: ContextAction; onclose: () => void } = $props();

  // Default: alle Gruppen ausgewählt (Erdung). Der Nutzer kann pro Lauf trimmen.
  let selectedGroups = $state<string[]>([]);
  let groupsTouched = false;
  let monsterGroupList = $derived.by(() => {
    const groups = new Map<string, number>();
    for (const m of $monsterLibrary) groups.set(m.group, (groups.get(m.group) ?? 0) + 1);
    return [...groups.entries()]
      .map(([group, count]) => ({ group, count }))
      .sort((a, b) => monsterTypeLabel(a.group).localeCompare(monsterTypeLabel(b.group), 'de'));
  });
  // Sobald die Bibliothek geladen ist und der Nutzer noch nichts angefasst hat:
  // alle Gruppen vorauswählen (race-sicher, falls monsterLibrary erst nach Mount lädt).
  $effect(() => {
    if (!groupsTouched && selectedGroups.length === 0 && monsterGroupList.length) {
      selectedGroups = monsterGroupList.map((g) => g.group);
    }
  });
  let selectedMonsterCount = $derived(
    $monsterLibrary.filter((m) => selectedGroups.includes(m.group)).length,
  );
  function toggleGroup(group: string) {
    groupsTouched = true;
    selectedGroups = selectedGroups.includes(group)
      ? selectedGroups.filter((g) => g !== group)
      : [...selectedGroups, group];
  }

  type LogEntry = { kind: 'phase'; text: string } | { kind: 'step'; step: AgentStep };

  let description = $state('');
  let log = $state<LogEntry[]>([]);
  let running = $state(false);
  let error = $state('');
  let result = $state('');
  let abort: AbortController | null = null;
  let userAborted = false;
  let pendingRestart = false;

  const clock = createRunClock(() => running);
  onDestroy(() => abort?.abort());

  let client = $derived(getClient($llmConfig));
  let canTools = $derived(client.capabilities.tools);

  async function run() {
    if (running) return;
    running = true;
    error = '';
    result = '';
    log = [];
    userAborted = false;
    abort = new AbortController();
    clock.start();
    try {
      const state = {
        activeFile: $activeFile,
        fileContent: $fileContent,
        party: $campaignCharacterData,
        monsterLibrary: $monsterLibrary,
        monsterGroups: $contextFlags.monsterGroups,
      };
      result = await action.run(state, $llmConfig, description.trim(), {
        onStep: (s) => { log = [...log, { kind: 'step', step: s }]; clock.touch(); },
        onActivity: () => clock.touch(),
        onPhase: (text) => { log = [...log, { kind: 'phase', text }]; clock.touch(); },
        signal: abort.signal,
      }, { monsterGroups: selectedGroups });
    } catch (e) {
      if (!userAborted) error = e instanceof Error ? e.message : String(e);
    } finally {
      clock.stop();
      running = false;
      abort = null;
      if (pendingRestart) { pendingRestart = false; run(); }
    }
  }

  function stop() { userAborted = true; abort?.abort(); }
  function retry() { pendingRestart = true; userAborted = true; abort?.abort(); }
</script>

<Modal title="{action.icon} {action.label}" label={action.label} {onclose} contentClass="ai-modal">
  <LlmProviderSelect />

  {#if !canTools}
    <p class="hint warn">Das gewählte Modell unterstützt keine Tools (DnD-API-Suche). Bitte ein Anthropic- oder Groq-Modell wählen.</p>
  {/if}

  <div class="row">
    <label class="field-label" for="ca-prompt">Auftrag</label>
    <textarea id="ca-prompt" class="textarea" bind:value={description} rows="3" placeholder={action.placeholder} disabled={running}></textarea>
  </div>

  {#if action.selectsMonsterGroups && monsterGroupList.length}
    <div class="row">
      <span class="field-label">
        Monster-Kontext
        <span class="field-hint">— optional, {selectedMonsterCount} Monster gewählt</span>
      </span>
      <div class="group-chips">
        {#each monsterGroupList as { group, count }}
          <button
            type="button"
            class="group-chip"
            class:on={selectedGroups.includes(group)}
            title="Monster-Gruppe: {monsterTypeLabel(group)}"
            disabled={running}
            onclick={() => toggleGroup(group)}
          >{monsterTypeLabel(group)} ({count})</button>
        {/each}
      </div>
      {#if selectedGroups.length === 0}
        <span class="field-hint">Keine Auswahl → die KI erfindet/sucht Monster selbst (kein Bibliotheks-Kontext).</span>
      {/if}
    </div>
  {/if}

  {#if running}
    <AiStatusBanner text="KI arbeitet… ({clock.elapsedSec}s)" />
  {/if}

  {#if log.length}
    <div class="steps">
      {#each log as entry}
        {#if entry.kind === 'phase'}
          <div class="phase">▸ {entry.text}</div>
        {:else}
          {@const label = describeAiStep(entry.step)}
          {#if label}<div class="step" class:muted={label.muted}>{label.icon} {label.text}</div>{/if}
        {/if}
      {/each}
    </div>
  {/if}

  {#if clock.stalled}
    <p class="hint warn">Seit {clock.stalledSec}s keine Antwort — du kannst neu versuchen oder abbrechen.</p>
  {/if}
  {#if result}<p class="hint ok">✓ {result}</p>{/if}
  {#if error}<p class="hint err">{error}</p>{/if}

  <div class="actions">
    {#if running}
      {#if clock.stalled}<button class="secondary-btn" onclick={retry}>Neu versuchen</button>{/if}
      <button class="secondary-btn" onclick={stop}>Abbrechen</button>
    {:else if result}
      <button class="primary-btn" onclick={onclose}>Schließen</button>
    {:else}
      <button class="primary-btn" onclick={run} disabled={!canTools}>Entwerfen</button>
    {/if}
  </div>
</Modal>

<style>
  .field-hint { text-transform: none; letter-spacing: 0; color: var(--ink-muted); font-size: 0.72rem; }

  .group-chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .group-chip {
    background: var(--surface); border: 1px solid var(--border); border-radius: 999px;
    color: var(--ink-muted); padding: 0.18rem 0.6rem; cursor: pointer; font-family: inherit; font-size: 0.74rem;
    opacity: 0.6;
  }
  .group-chip:hover:not(:disabled) { opacity: 0.85; }
  .group-chip.on { border-color: var(--red); color: var(--ink); opacity: 1; }
  .group-chip:disabled { cursor: not-allowed; }

  .steps { --steps-max-h: 220px; }

  .phase { font-size: 0.8rem; color: var(--ink); font-weight: 600; margin-top: 0.25rem; }

  .hint.ok { color: var(--arcane); }
</style>
