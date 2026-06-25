<script lang="ts">
  import { onDestroy } from 'svelte';
  import { llmConfig, saveConfig, loadApiKeyForProvider } from '../stores/llm';
  import { getClient } from '../services/llmClient';
  import { describeAiStep } from '../services/aiActions/describeStep';
  import { modelsFor, defaultModelFor, defaultBaseUrlFor } from '../llmModels';
  import { monsterLibrary } from '../stores/context';
  import { monsterTypeLabel } from '../types';
  import type { LlmProvider } from '../types';
  import type { AgentStep } from '../services/vaultTools';
  import type { ContextAction } from '../services/contextActions';

  let { action, onclose }: { action: ContextAction; onclose: () => void } = $props();

  // ── Monster-Gruppen-Kontext-Picker (z.B. „Encounter entwerfen") ─────────────
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

  // ── Verschiebbarer Dialog ───────────────────────────────────────────────────
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

  // ── Lauf-State ────────────────────────────────────────────────────────────────
  let description = $state('');
  let log = $state<LogEntry[]>([]);
  let running = $state(false);
  let error = $state('');
  let result = $state('');
  let abort: AbortController | null = null;

  const STALL_MS = 50_000;
  let nowMs = $state(0);
  let runStartMs = 0;
  let lastActivityMs = $state(0);
  let tick: ReturnType<typeof setInterval> | null = null;
  let userAborted = false;
  let pendingRestart = false;

  let elapsedSec = $derived(running ? Math.max(0, Math.floor((nowMs - runStartMs) / 1000)) : 0);
  let stalledSec = $derived(running ? Math.max(0, Math.floor((nowMs - lastActivityMs) / 1000)) : 0);
  let stalled = $derived(running && nowMs - lastActivityMs > STALL_MS);

  function startClock() {
    runStartMs = Date.now();
    lastActivityMs = Date.now();
    nowMs = Date.now();
    tick = setInterval(() => { nowMs = Date.now(); }, 500);
  }
  function stopClock() { if (tick) { clearInterval(tick); tick = null; } }
  onDestroy(() => { stopClock(); abort?.abort(); endDrag(); });

  let client = $derived(getClient($llmConfig));
  let canTools = $derived(client.capabilities.tools);

  async function changeProvider(provider: LlmProvider) {
    const key = await loadApiKeyForProvider(provider);
    await saveConfig({ ...$llmConfig, provider, model: defaultModelFor(provider), apiKey: key ?? undefined, baseUrl: defaultBaseUrlFor(provider) });
  }
  async function changeModel(model: string) { await saveConfig({ ...$llmConfig, model }); }

  async function run() {
    if (running) return;
    running = true;
    error = '';
    result = '';
    log = [];
    userAborted = false;
    abort = new AbortController();
    startClock();
    try {
      result = await action.run($llmConfig, description.trim(), {
        onStep: (s) => { log = [...log, { kind: 'step', step: s }]; lastActivityMs = Date.now(); },
        onActivity: () => { lastActivityMs = Date.now(); },
        onPhase: (text) => { log = [...log, { kind: 'phase', text }]; lastActivityMs = Date.now(); },
        signal: abort.signal,
      }, { monsterGroups: selectedGroups });
    } catch (e) {
      if (!userAborted) error = e instanceof Error ? e.message : String(e);
    } finally {
      stopClock();
      running = false;
      abort = null;
      if (pendingRestart) { pendingRestart = false; run(); }
    }
  }

  function stop() { userAborted = true; abort?.abort(); }
  function retry() { pendingRestart = true; userAborted = true; abort?.abort(); }
</script>

<div class="dialog" style="left: {pos.x}px; top: {pos.y}px;" role="dialog" aria-label={action.label}>
  <div class="modal-header" onmousedown={startDrag} role="presentation">
    <span class="modal-title">{action.icon} {action.label}</span>
    <button class="close-btn" onmousedown={(e) => e.stopPropagation()} onclick={onclose} title="Schließen">×</button>
  </div>

  <div class="row two">
    <select class="select" value={$llmConfig.provider} onchange={(e) => changeProvider((e.target as HTMLSelectElement).value as LlmProvider)}>
      <option value="anthropic">Anthropic</option>
      <option value="groq">Groq</option>
      <option value="xai">xAI</option>
      <option value="qualityminds">QualityMinds</option>
      <option value="ollama">Ollama</option>
    </select>
    {#if modelsFor($llmConfig.provider).length}
      <select class="select" value={$llmConfig.model} onchange={(e) => changeModel((e.target as HTMLSelectElement).value)}>
        {#each modelsFor($llmConfig.provider) as m}<option value={m}>{m}</option>{/each}
      </select>
    {:else}
      <input class="input" value={$llmConfig.model} onchange={(e) => changeModel((e.target as HTMLInputElement).value)} placeholder="Modell" />
    {/if}
  </div>

  {#if !canTools}
    <p class="hint warn">Das gewählte Modell unterstützt keine Tools (DnD-API-Suche). Bitte ein Anthropic-, Groq- oder xAI-Modell wählen.</p>
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
    <div class="ai-status"><span class="spinner" aria-hidden="true"></span><span>KI arbeitet… ({elapsedSec}s)</span></div>
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

  {#if stalled}
    <p class="hint warn">Seit {stalledSec}s keine Antwort — du kannst neu versuchen oder abbrechen.</p>
  {/if}
  {#if result}<p class="hint ok">✓ {result}</p>{/if}
  {#if error}<p class="hint err">{error}</p>{/if}

  <div class="actions">
    {#if running}
      {#if stalled}<button class="secondary-btn" onclick={retry}>Neu versuchen</button>{/if}
      <button class="secondary-btn" onclick={stop}>Abbrechen</button>
    {:else if result}
      <button class="primary-btn" onclick={onclose}>Schließen</button>
    {:else}
      <button class="primary-btn" onclick={run} disabled={!canTools}>Entwerfen</button>
    {/if}
  </div>
</div>

<style>
  .dialog {
    position: fixed; width: min(560px, 92vw); max-height: 84vh; overflow-y: auto;
    background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
    padding: 0 1.1rem 1.2rem; display: flex; flex-direction: column; gap: 0.7rem;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5); z-index: 1000;
  }
  .modal-header {
    display: flex; justify-content: space-between; align-items: center; cursor: grab; user-select: none;
    margin: 0 -1.1rem 0.2rem; padding: 0.6rem 1.1rem; border-bottom: 1px solid var(--surface);
    position: sticky; top: 0; background: var(--bg);
  }
  .modal-header:active { cursor: grabbing; }
  .modal-title { font-weight: 700; font-size: 1rem; color: var(--ink); }
  .close-btn { background: none; border: none; color: var(--ink-muted); font-size: 1.3rem; cursor: pointer; line-height: 1; }
  .close-btn:hover { color: var(--ink); }

  .row { display: flex; flex-direction: column; gap: 0.3rem; }
  .row.two { flex-direction: row; gap: 0.5rem; }
  .row.two > * { flex: 1; }
  .field-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-muted); }
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

  .input, .select, .textarea {
    background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
    color: var(--ink); font-size: 0.85rem; padding: 0.35rem 0.5rem; outline: none; font-family: inherit; width: 100%;
  }
  .input:focus, .select:focus, .textarea:focus { border-color: var(--red); }
  .textarea { resize: vertical; }

  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
  .primary-btn { background: var(--red); border: none; border-radius: 4px; color: #fff; padding: 0.35rem 0.9rem; cursor: pointer; font-family: inherit; font-size: 0.85rem; }
  .primary-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .secondary-btn { background: var(--surface); border: 1px solid var(--border); border-radius: 4px; color: var(--ink-soft); padding: 0.35rem 0.9rem; cursor: pointer; font-family: inherit; font-size: 0.85rem; }

  .ai-status { display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; color: var(--ink-soft); }
  .spinner { width: 0.9rem; height: 0.9rem; flex-shrink: 0; border: 2px solid var(--surface); border-top-color: var(--red); border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .steps { display: flex; flex-direction: column; gap: 0.2rem; max-height: 220px; overflow-y: auto; padding: 0.3rem 0; }
  .step { font-size: 0.78rem; color: var(--ink-soft); }
  .step.muted { color: var(--ink-muted); }
  .phase { font-size: 0.8rem; color: var(--ink); font-weight: 600; margin-top: 0.25rem; }

  .hint { font-size: 0.78rem; margin: 0; }
  .hint.warn { color: var(--gold, #c89b3c); }
  .hint.err { color: var(--danger); }
  .hint.ok { color: var(--arcane); }
</style>
