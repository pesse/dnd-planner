<script lang="ts">
  import { onDestroy } from 'svelte';
  import { llmConfig, saveConfig, loadApiKeyForProvider } from '../stores/llm';
  import { getClient } from '../services/llmClient';
  import { runAiAction } from '../services/aiActions/runner';
  import { createItemAction } from '../services/aiActions/itemAction';
  import { describeAiStep } from '../services/aiActions/describeStep';
  import { modelsFor, defaultModelFor, defaultBaseUrlFor } from '../llmModels';
  import {
    API_CATEGORY_MAP,
    getItemsByDir,
    searchItems as searchLibraryItems,
    displayName,
    type ItemInfo,
  } from '../itemLibrary';
  import { getResource, searchDndApiItems, mapApiResourceToItem, type DndApiItemRef } from '../services/dndApi';
  import { normalizeItem } from '../utils/schemaValidation';
  import { invoke } from '@tauri-apps/api/core';
  import { newItemDraft, activeFile } from '../stores/campaign';
  import type { LlmProvider, Item } from '../types';
  import type { AgentStep } from '../services/vaultTools';

  let {
    dirs,
    defaultDir = '',
    onclose,
  }: {
    dirs: string[];
    defaultDir?: string;
    onclose: () => void;
  } = $props();

  let aiEnabled = $state(false);

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

  // Zielordner für Blanko-Gegenstände (Kategorie ist später im Editor änderbar).
  let blankDir = $derived(defaultDir || dirs[0] || 'other');

  // Öffnet das (noch ungespeicherte) Item in der Bearbeiten-Card und schließt den Dialog.
  function openDraft(item: Item, targetDir: string) {
    newItemDraft.set({ item, dir: targetDir });
    activeFile.set({ name: item.name_de || item.name || 'Gegenstand', path: '', type: 'item' });
    onclose();
  }

  /** Leitet den Zielordner (Kategorie) aus dem generierten Item ab. */
  function dirOf(item: Item): string {
    const idx = item.equipment_category?.index;
    if (idx) return API_CATEGORY_MAP[idx] ?? 'other';
    if (item.item_type === 'weapon') return 'weapon';
    if (item.item_type === 'armor') return 'armor';
    if (item.item_type === 'magic') return 'wondrous-items';
    return 'other';
  }

  function categoryToItemType(catKey: string): Item['item_type'] {
    if (catKey === 'weapon' || catKey === 'ammunition') return 'weapon';
    if (catKey === 'armor') return 'armor';
    if (['ring', 'rod', 'staff', 'wand', 'scroll', 'potion', 'wondrous-items'].includes(catKey)) return 'magic';
    return 'gear';
  }
  function categoryApiName(catKey: string): string {
    return catKey.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  // ── Manueller Pfad ────────────────────────────────────────────────────────
  let manualName = $state('');

  function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /** Legt an: auf Basis der gewählten Vorlage oder – ohne Vorlage – ein leeres Item. */
  async function createItem() {
    if (creating) return;
    creating = true;
    templateError = '';
    try {
      if (selectedTemplate) {
        await createFromTemplate(selectedTemplate);
      } else {
        createBlank();
      }
    } catch (e) {
      templateError = `Anlegen fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      creating = false;
    }
  }

  function createBlank() {
    const name = capitalize(manualName.trim());
    openDraft({
      name,
      name_de: name,
      item_type: categoryToItemType(blankDir),
      equipment_category: { index: blankDir, name: categoryApiName(blankDir) },
      desc: [],
      desc_de: [],
      source: 'eigen',
    }, blankDir);
  }

  /** Lädt die vollständige Vorlage (Bibliotheks-Item oder DnD-API-Ressource). */
  async function loadTemplate(hit: TemplateHit): Promise<{ item: Item; dir: string }> {
    if (hit.kind === 'lib') {
      const content = await invoke<string>('read_file_content', { path: hit.path });
      return { item: normalizeItem(JSON.parse(content)), dir: hit.dir };
    }
    const data = await getResource(hit.ref.url);
    const item = mapApiResourceToItem(data, hit.ref.source);
    return { item, dir: dirOf(item) };
  }

  /** Öffnet die Vorlage als anpassbare Homebrew-Kopie (ohne Verknüpfung zur Quelle). */
  async function createFromTemplate(hit: TemplateHit) {
    const { item, dir } = await loadTemplate(hit);
    const copy: Item = { ...item, source: 'eigen', index: undefined, url: undefined };
    // Eingegebener Name überschreibt den deutschen Namen der Vorlage.
    const override = manualName.trim();
    if (override) copy.name_de = capitalize(override);
    openDraft(copy, dir);
  }

  // ── Vorlage (Bibliothek + DnD-API) ──────────────────────────────────────────
  type TemplateHit =
    | { kind: 'lib'; name: string; path: string; dir: string; badge: string }
    | { kind: 'api'; name: string; ref: DndApiItemRef; badge: string };

  let templateQuery = $state('');
  let templateResults = $state<TemplateHit[]>([]);
  let templateSearching = $state(false);
  let templateError = $state('');
  let selectedTemplate = $state<TemplateHit | null>(null);
  let creating = $state(false);

  let libByDir: Record<string, ItemInfo[]> = {};
  let libLoaded = false;

  async function ensureLibrary() {
    if (libLoaded) return;
    const entries = await Promise.all(dirs.map(async (d) => [d, await getItemsByDir(d)] as const));
    libByDir = Object.fromEntries(entries);
    libLoaded = true;
  }

  async function searchTemplates() {
    const q = templateQuery.trim();
    if (!q || templateSearching) return;
    templateSearching = true;
    templateError = '';
    templateResults = [];
    try {
      await ensureLibrary();
      const libHits: TemplateHit[] = searchLibraryItems(libByDir, q, 8).map((s) => ({
        kind: 'lib',
        name: displayName(s.item),
        path: s.item.path,
        dir: s.dir,
        badge: 'Bibliothek',
      }));
      let apiHits: TemplateHit[] = [];
      try {
        apiHits = (await searchDndApiItems(q)).map((r) => ({ kind: 'api', name: r.name, ref: r, badge: 'SRD' }));
      } catch (e) {
        templateError = `DnD-API nicht erreichbar: ${e instanceof Error ? e.message : String(e)}`;
      }
      templateResults = [...libHits, ...apiHits];
    } finally {
      templateSearching = false;
    }
  }

  /** Merkt sich die Vorlage; angelegt wird erst auf „Anlegen". */
  function selectTemplate(hit: TemplateHit) {
    selectedTemplate = hit;
    templateResults = [];
    templateQuery = '';
    templateError = '';
  }

  function clearTemplate() {
    selectedTemplate = null;
  }

  // ── KI-Pfad ───────────────────────────────────────────────────────────────
  let description = $state('');
  let steps = $state<AgentStep[]>([]);
  let running = $state(false);
  let error = $state('');
  let abort: AbortController | null = null;

  // Live-Status, damit der Dialog während des Agenten-Laufs nicht eingefroren wirkt.
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
  function stopClock() {
    if (tick) { clearInterval(tick); tick = null; }
  }
  onDestroy(() => { stopClock(); abort?.abort(); });

  let client = $derived(getClient($llmConfig));
  let canTools = $derived(client.capabilities.tools);

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

  /** Legt mit KI-Unterstützung an: Name, Vorlage (als JSON) und Prompt fließen in den Agenten. */
  async function generate() {
    if (running) return;
    running = true;
    error = '';
    steps = [];
    userAborted = false;
    abort = new AbortController();
    startClock();
    try {
      const name = manualName.trim();
      let template: Item | undefined;
      let targetDir: string | undefined;
      if (selectedTemplate) {
        const loaded = await loadTemplate(selectedTemplate);
        // Vorlage als Ausgangspunkt — ohne Verknüpfung zur Quelle.
        template = { ...loaded.item, source: 'eigen', index: undefined, url: undefined };
        targetDir = loaded.dir;
      }
      const action = createItemAction({ name: name || undefined, template });
      const userInput = description.trim() || 'Erstelle den Gegenstand gemäß den Vorgaben.';
      const item = await runAiAction<Item>($llmConfig, action, userInput, {
        onStep: (s) => { steps = [...steps, s]; lastActivityMs = Date.now(); },
        signal: abort.signal,
      });
      item.source = 'KI';
      openDraft(item, targetDir ?? dirOf(item));
    } catch (e) {
      if (!userAborted) error = e instanceof Error ? e.message : String(e);
    } finally {
      stopClock();
      running = false;
      abort = null;
      if (pendingRestart) { pendingRestart = false; generate(); }
    }
  }

  /** Bricht den Lauf ab (das wartende await löst sich sofort, s. rustFetchStream). */
  function stop() {
    userAborted = true;
    abort?.abort();
  }

  /** Bricht ab und startet sofort neu — für hängende/zu langsame Läufe. */
  function retry() {
    pendingRestart = true;
    userAborted = true;
    abort?.abort();
  }
</script>

<div class="dialog" style="left: {pos.x}px; top: {pos.y}px;" role="dialog" aria-label="Neuer Gegenstand">
    <div class="modal-header" onmousedown={startDrag} role="presentation">
      <span class="modal-title">Neuer Gegenstand</span>
      <button class="close-btn" onmousedown={(e) => e.stopPropagation()} onclick={onclose} title="Schließen">×</button>
    </div>

    <div class="row">
      <label class="field-label" for="name-input">Name {selectedTemplate ? '(überschreibt Vorlagenname)' : ''}</label>
      <input
        id="name-input"
        class="input"
        bind:value={manualName}
        placeholder={selectedTemplate ? selectedTemplate.name : 'z.B. Kriegshammer'}
        onkeydown={(e) => { if (e.key === 'Enter' && !aiEnabled) createItem(); }}
      />
    </div>

    <div class="template">
      {#if selectedTemplate}
        <div class="tpl-selected">
          <span class="tpl-result-name">{selectedTemplate.name}</span>
          <span class="tpl-result-badge" class:api={selectedTemplate.kind === 'api'}>{selectedTemplate.badge}</span>
          <button class="tpl-clear" onclick={clearTemplate} title="Vorlage entfernen">×</button>
        </div>
      {:else}
        <div class="tpl-search-row">
          <input
            class="input"
            bind:value={templateQuery}
            placeholder="Vorlage suchen (Bibliothek + DnD-API)…"
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
                <span class="tpl-result-badge" class:api={hit.kind === 'api'}>{hit.badge}</span>
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
        <!-- Modell-Auswahl (teilt sich llmConfig mit dem LLM-Panel) -->
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
              {#each modelsFor($llmConfig.provider) as m}
                <option value={m}>{m}</option>
              {/each}
            </select>
          {:else}
            <input class="input" value={$llmConfig.model} onchange={(e) => changeModel((e.target as HTMLInputElement).value)} placeholder="Modell" />
          {/if}
        </div>

        {#if !canTools}
          <p class="hint warn">Das gewählte Modell unterstützt keine Tools (DnD-API-Suche). Bitte ein Anthropic-, Groq- oder xAI-Modell wählen.</p>
        {/if}

        <div class="row">
          <label class="field-label" for="desc-input">Prompt</label>
          <textarea
            id="desc-input"
            class="textarea"
            bind:value={description}
            rows="3"
            placeholder={selectedTemplate
              ? 'z.B. als +1-Variante mit Runen, die bei Nacht leuchten'
              : 'z.B. Kriegshammer aus Obsidian, schwarz glänzend, mit Runen graviert'}
          ></textarea>
        </div>

        {#if running}
          <div class="ai-status">
            <span class="spinner" aria-hidden="true"></span>
            <span>KI arbeitet… ({elapsedSec}s)</span>
          </div>
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

        {#if stalled}
          <p class="hint warn">Seit {stalledSec}s keine Antwort — Verbindung oder Modell hängt evtl. Du kannst neu versuchen oder abbrechen.</p>
        {/if}
      {/if}
    </div>

    {#if templateError}<p class="hint err">{templateError}</p>{/if}
    {#if error}<p class="hint err">{error}</p>{/if}

    <div class="actions">
      {#if aiEnabled}
        {#if running}
          {#if stalled}
            <button class="secondary-btn" onclick={retry}>Neu versuchen</button>
          {/if}
          <button class="secondary-btn" onclick={stop}>Abbrechen</button>
        {:else}
          <button
            class="primary-btn"
            onclick={generate}
            disabled={!canTools || (!selectedTemplate && !manualName.trim() && !description.trim())}
          >Mit KI anlegen</button>
        {/if}
      {:else}
        <button
          class="primary-btn"
          onclick={createItem}
          disabled={creating || (!selectedTemplate && !manualName.trim())}
        >
          {creating ? '…' : 'Anlegen'}
        </button>
      {/if}
    </div>
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

  .ai-toggle {
    display: flex; align-items: center; gap: 0.5rem;
    font-size: 0.85rem; color: var(--ink-soft); cursor: pointer; user-select: none;
  }
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
  .primary-btn {
    background: var(--red); border: none; border-radius: 4px; color: #fff;
    padding: 0.35rem 0.9rem; cursor: pointer; font-family: inherit; font-size: 0.85rem;
  }
  .primary-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .secondary-btn {
    background: var(--surface); border: 1px solid var(--border); border-radius: 4px; color: var(--ink-soft);
    padding: 0.35rem 0.9rem; cursor: pointer; font-family: inherit; font-size: 0.85rem;
  }

  .ai-status { display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; color: var(--ink-soft); }
  .spinner {
    width: 0.9rem; height: 0.9rem; flex-shrink: 0;
    border: 2px solid var(--surface); border-top-color: var(--red); border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .steps { display: flex; flex-direction: column; gap: 0.2rem; max-height: 160px; overflow-y: auto; padding: 0.3rem 0; }
  .step { font-size: 0.78rem; color: var(--ink-soft); }
  .step.muted { color: var(--ink-muted); }

  .hint { font-size: 0.78rem; margin: 0; }
  .hint.warn { color: var(--gold, #c89b3c); }
  .hint.err { color: var(--danger); }

  /* ── Vorlage ── */
  .template { display: flex; flex-direction: column; gap: 0.4rem; }
  .ai-block { border-top: 1px solid var(--surface); padding-top: 0.6rem; margin-top: 0.1rem; }
  .tpl-search-row { display: flex; gap: 0.4rem; }
  .tpl-search-row .input { flex: 1; }
  .tpl-search-row .secondary-btn { flex-shrink: 0; white-space: nowrap; }

  .tpl-results { display: flex; flex-direction: column; gap: 0.2rem; max-height: 200px; overflow-y: auto; }
  .tpl-result {
    display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;
    background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
    color: var(--ink); font-size: 0.82rem; padding: 0.3rem 0.6rem; cursor: pointer;
    text-align: left; font-family: inherit;
  }
  .tpl-result:hover { border-color: var(--red); color: var(--red); }
  .tpl-result-name { font-weight: 500; flex: 1; }
  .tpl-result-badge {
    font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.04em;
    color: var(--ink-muted); border: 1px solid var(--border); border-radius: 3px;
    padding: 0.05rem 0.35rem; flex-shrink: 0;
  }
  .tpl-result-badge.api { color: var(--arcane); border-color: var(--arcane); }

  .tpl-selected {
    display: flex; align-items: center; gap: 0.5rem;
    background: var(--surface); border: 1px solid var(--red); border-radius: 4px;
    padding: 0.3rem 0.5rem 0.3rem 0.6rem; font-size: 0.82rem; color: var(--ink);
  }
  .tpl-selected .tpl-result-name { flex: 1; font-weight: 500; }
  .tpl-clear {
    background: none; border: none; color: var(--ink-muted); font-size: 1.1rem;
    line-height: 1; cursor: pointer; flex-shrink: 0; padding: 0 0.1rem;
  }
  .tpl-clear:hover { color: var(--red); }
</style>
