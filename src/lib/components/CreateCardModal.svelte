<script lang="ts" generics="T">
  import { onDestroy } from 'svelte';
  import { llmConfig, saveConfig, loadApiKeyForProvider } from '../stores/llm';
  import { getClient } from '../services/llmClient';
  import { runAiAction } from '../services/aiActions/runner';
  import { describeAiStep } from '../services/aiActions/describeStep';
  import { modelsFor, defaultModelFor, defaultBaseUrlFor } from '../llmModels';
  import { newCardDraft } from '../editor/cardEditor.svelte';
  import { activeFile } from '../stores/campaign';
  import { getResource, type DndApiRef } from '../services/dndApi';
  import type { LlmProvider, FileEntry } from '../types';
  import type { AiAction } from '../services/aiActions/types';
  import type { AgentStep } from '../services/vaultTools';

  let {
    type,
    title,
    searchApi,
    mapApi,
    searchLibrary,
    blank,
    buildAction,
    nameOf,
    onCreated,
    onclose,
  }: {
    type: FileEntry['type'];
    title: string;
    /** DnD-API-Suche (englischer Begriff). */
    searchApi: (q: string) => Promise<DndApiRef[]>;
    /** Rohe API-Ressource → Draft. */
    mapApi: (data: Record<string, unknown>) => T;
    /** Optionale Bibliothekssuche (bestehende Vault-Einträge als Vorlage). */
    searchLibrary?: (q: string) => Promise<{ name: string; load: () => Promise<T> }[]>;
    /** Leerer Draft mit gegebenem Namen. */
    blank: (name: string) => T;
    /** KI-Anlage-Aktion. */
    buildAction: (opts: { name?: string; template?: T }) => AiAction<T>;
    /** Anzeigename eines Drafts (für activeFile-Platzhalter). */
    nameOf: (draft: T) => string;
    /**
     * Optional: übernimmt den fertigen Draft selbst (statt Standard `newCardDraft`).
     * Für Entities mit eigenem Draft-Store (z.B. Item: `newItemDraft` mit Zielordner).
     */
    onCreated?: (draft: T) => void;
    onclose: () => void;
  } = $props();

  /** Vereinheitlichter Vorlagen-Treffer (Bibliothek oder SRD). */
  type TemplateHit = { name: string; badge: string; api: boolean; load: () => Promise<T> };

  let aiEnabled = $state(false);

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
  onDestroy(endDrag);

  function capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

  /**
   * Öffnet den (noch ungespeicherten) Draft im Editor und schließt den Dialog.
   * Der Navigations-Guard greift bereits beim Öffnen dieses Dialogs (siehe
   * createMonster/createSpell/openItemModal in der Sidebar), daher hier nicht erneut.
   */
  function openDraft(draft: T) {
    if (onCreated) onCreated(draft);
    else newCardDraft.set({ type, data: draft });
    activeFile.set({ name: nameOf(draft), path: '', type });
    onclose();
  }

  // ── Manueller Pfad ──────────────────────────────────────────────────────────
  let manualName = $state('');
  let creating = $state(false);
  let templateError = $state('');

  async function create() {
    if (creating) return;
    creating = true;
    templateError = '';
    try {
      openDraft(selectedTemplate ? await selectedTemplate.load() : blank(capitalize(manualName.trim())));
    } catch (e) {
      templateError = `Anlegen fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      creating = false;
    }
  }

  // ── Vorlage (Bibliothek + DnD-API) ──────────────────────────────────────────
  let templateQuery = $state('');
  let templateResults = $state<TemplateHit[]>([]);
  let templateSearching = $state(false);
  let selectedTemplate = $state<TemplateHit | null>(null);

  async function searchTemplates() {
    const q = templateQuery.trim();
    if (!q || templateSearching) return;
    templateSearching = true;
    templateError = '';
    templateResults = [];
    try {
      const libHits: TemplateHit[] = searchLibrary
        ? (await searchLibrary(q)).map((h) => ({ name: h.name, badge: 'Bibliothek', api: false, load: h.load }))
        : [];
      let apiHits: TemplateHit[] = [];
      try {
        apiHits = (await searchApi(q)).map((ref) => ({
          name: ref.name,
          badge: 'SRD',
          api: true,
          load: async () => mapApi(await getResource(ref.url)),
        }));
      } catch (e) {
        templateError = `DnD-API nicht erreichbar: ${e instanceof Error ? e.message : String(e)}`;
      }
      templateResults = [...libHits, ...apiHits];
      if (!templateResults.length && !templateError) templateError = 'Keine Treffer.';
    } finally {
      templateSearching = false;
    }
  }

  function selectTemplate(hit: TemplateHit) {
    selectedTemplate = hit;
    templateResults = [];
    templateQuery = '';
    templateError = '';
  }
  function clearTemplate() { selectedTemplate = null; }

  // ── KI-Pfad ───────────────────────────────────────────────────────────────
  let description = $state('');
  let steps = $state<AgentStep[]>([]);
  let running = $state(false);
  let error = $state('');
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
  onDestroy(() => { stopClock(); abort?.abort(); });

  let client = $derived(getClient($llmConfig));
  let canTools = $derived(client.capabilities.tools);

  async function changeProvider(provider: LlmProvider) {
    const key = await loadApiKeyForProvider(provider);
    await saveConfig({ ...$llmConfig, provider, model: defaultModelFor(provider), apiKey: key ?? undefined, baseUrl: defaultBaseUrlFor(provider) });
  }
  async function changeModel(model: string) { await saveConfig({ ...$llmConfig, model }); }

  async function generate() {
    if (running) return;
    running = true;
    error = '';
    steps = [];
    userAborted = false;
    abort = new AbortController();
    startClock();
    try {
      let template: T | undefined;
      if (selectedTemplate) template = await selectedTemplate.load();
      const name = manualName.trim();
      const action = buildAction({ name: name || undefined, template });
      const userInput = description.trim() || 'Erstelle den Datensatz gemäß den Vorgaben.';
      const draft = await runAiAction<T>($llmConfig, action, userInput, {
        onStep: (s) => { steps = [...steps, s]; lastActivityMs = Date.now(); },
        onActivity: () => { lastActivityMs = Date.now(); },
        signal: abort.signal,
      });
      openDraft(draft);
    } catch (e) {
      if (!userAborted) error = e instanceof Error ? e.message : String(e);
    } finally {
      stopClock();
      running = false;
      abort = null;
      if (pendingRestart) { pendingRestart = false; generate(); }
    }
  }

  function stop() { userAborted = true; abort?.abort(); }
  function retry() { pendingRestart = true; userAborted = true; abort?.abort(); }
</script>

<div class="dialog" style="left: {pos.x}px; top: {pos.y}px;" role="dialog" aria-label={title}>
  <div class="modal-header" onmousedown={startDrag} role="presentation">
    <span class="modal-title">{title}</span>
    <button class="close-btn" onmousedown={(e) => e.stopPropagation()} onclick={onclose} title="Schließen">×</button>
  </div>

  <div class="row">
    <label class="field-label" for="cc-name">Name {selectedTemplate ? '(überschreibt Vorlagenname)' : ''}</label>
    <input
      id="cc-name"
      class="input"
      bind:value={manualName}
      placeholder={selectedTemplate ? selectedTemplate.name : 'z.B. Goblin-Häuptling'}
      onkeydown={(e) => { if (e.key === 'Enter' && !aiEnabled) create(); }}
    />
  </div>

  <div class="template">
    {#if selectedTemplate}
      <div class="tpl-selected">
        <span class="tpl-result-name">{selectedTemplate.name}</span>
        <span class="tpl-result-badge" class:api={selectedTemplate.api}>{selectedTemplate.badge}</span>
        <button class="tpl-clear" onclick={clearTemplate} title="Vorlage entfernen">×</button>
      </div>
    {:else}
      <div class="tpl-search-row">
        <input
          class="input"
          bind:value={templateQuery}
          placeholder={searchLibrary ? 'Vorlage suchen (Bibliothek + SRD)…' : 'SRD-Vorlage suchen (englisch)…'}
          onkeydown={(e) => { if (e.key === 'Enter') searchTemplates(); }}
        />
        <button class="secondary-btn" onclick={searchTemplates} disabled={templateSearching || !templateQuery.trim()}>
          {templateSearching ? '…' : 'Suchen'}
        </button>
      </div>
      {#if templateResults.length}
        <div class="tpl-results">
          {#each templateResults as hit}
            <button class="tpl-result" onclick={() => selectTemplate(hit)}>
              <span class="tpl-result-name">{hit.name}</span>
              <span class="tpl-result-badge" class:api={hit.api}>{hit.badge}</span>
            </button>
          {/each}
        </div>
      {/if}
    {/if}
  </div>

  <div class="template ai-block">
    <label class="ai-toggle">
      <input type="checkbox" bind:checked={aiEnabled} />
      <span>KI-Unterstützung</span>
    </label>

    {#if aiEnabled}
      <div class="row two">
        <select class="select" value={$llmConfig.provider} onchange={(e) => changeProvider((e.target as HTMLSelectElement).value as LlmProvider)}>
          <option value="anthropic">Anthropic</option>
          <option value="groq">Groq</option>
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
        <p class="hint warn">Das gewählte Modell unterstützt keine Tools (DnD-API-Suche). Bitte ein Anthropic- oder Groq-Modell wählen.</p>
      {/if}

      <div class="row">
        <label class="field-label" for="cc-prompt">Prompt</label>
        <textarea id="cc-prompt" class="textarea" bind:value={description} rows="3"
          placeholder={selectedTemplate ? 'z.B. als stärkere Elite-Variante' : 'z.B. ein hinterhältiger Goblin-Späher mit Gift'}></textarea>
      </div>

      {#if running}
        <div class="ai-status"><span class="spinner" aria-hidden="true"></span><span>KI arbeitet… ({elapsedSec}s)</span></div>
      {/if}
      {#if steps.length}
        <div class="steps">
          {#each steps as s}{@const label = describeAiStep(s)}{#if label}<div class="step" class:muted={label.muted}>{label.icon} {label.text}</div>{/if}{/each}
        </div>
      {/if}
      {#if stalled}
        <p class="hint warn">Seit {stalledSec}s keine Antwort — du kannst neu versuchen oder abbrechen.</p>
      {/if}
    {/if}
  </div>

  {#if templateError}<p class="hint err">{templateError}</p>{/if}
  {#if error}<p class="hint err">{error}</p>{/if}

  <div class="actions">
    {#if aiEnabled}
      {#if running}
        {#if stalled}<button class="secondary-btn" onclick={retry}>Neu versuchen</button>{/if}
        <button class="secondary-btn" onclick={stop}>Abbrechen</button>
      {:else}
        <button class="primary-btn" onclick={generate} disabled={!canTools || (!selectedTemplate && !manualName.trim() && !description.trim())}>Mit KI anlegen</button>
      {/if}
    {:else}
      <button class="primary-btn" onclick={create} disabled={creating || (!selectedTemplate && !manualName.trim())}>
        {creating ? '…' : 'Anlegen'}
      </button>
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

  .ai-toggle { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: var(--ink-soft); cursor: pointer; user-select: none; }
  .ai-toggle input { accent-color: var(--red); cursor: pointer; }

  .row { display: flex; flex-direction: column; gap: 0.3rem; }
  .row.two { flex-direction: row; gap: 0.5rem; }
  .row.two > * { flex: 1; }
  .field-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-muted); }

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

  .steps { display: flex; flex-direction: column; gap: 0.2rem; max-height: 160px; overflow-y: auto; padding: 0.3rem 0; }
  .step { font-size: 0.78rem; color: var(--ink-soft); }
  .step.muted { color: var(--ink-muted); }

  .hint { font-size: 0.78rem; margin: 0; }
  .hint.warn { color: var(--gold, #c89b3c); }
  .hint.err { color: var(--danger); }

  .template { display: flex; flex-direction: column; gap: 0.4rem; }
  .ai-block { border-top: 1px solid var(--surface); padding-top: 0.6rem; margin-top: 0.1rem; }
  .tpl-search-row { display: flex; gap: 0.4rem; }
  .tpl-search-row .input { flex: 1; }
  .tpl-search-row .secondary-btn { flex-shrink: 0; white-space: nowrap; }

  .tpl-results { display: flex; flex-direction: column; gap: 0.2rem; max-height: 200px; overflow-y: auto; }
  .tpl-result {
    display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;
    background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
    color: var(--ink); font-size: 0.82rem; padding: 0.3rem 0.6rem; cursor: pointer; text-align: left; font-family: inherit;
  }
  .tpl-result:hover { border-color: var(--red); color: var(--red); }
  .tpl-result-name { font-weight: 500; flex: 1; }
  .tpl-result-badge { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--arcane); border: 1px solid var(--arcane); border-radius: 3px; padding: 0.05rem 0.35rem; flex-shrink: 0; }

  .tpl-selected { display: flex; align-items: center; gap: 0.5rem; background: var(--surface); border: 1px solid var(--red); border-radius: 4px; padding: 0.3rem 0.5rem 0.3rem 0.6rem; font-size: 0.82rem; color: var(--ink); }
  .tpl-selected .tpl-result-name { flex: 1; font-weight: 500; }
  .tpl-clear { background: none; border: none; color: var(--ink-muted); font-size: 1.1rem; line-height: 1; cursor: pointer; flex-shrink: 0; padding: 0 0.1rem; }
  .tpl-clear:hover { color: var(--red); }
</style>
