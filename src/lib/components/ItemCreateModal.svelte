<script lang="ts">
  import { onDestroy } from 'svelte';
  import { llmConfig, saveConfig, loadApiKeyForProvider } from '../stores/llm';
  import { getClient } from '../services/llmClient';
  import { runAiAction } from '../services/aiActions/runner';
  import { createItemAction } from '../services/aiActions/itemAction';
  import { describeAiStep } from '../services/aiActions/describeStep';
  import { modelsFor, defaultModelFor, defaultBaseUrlFor } from '../llmModels';
  import { CATEGORY_LABELS, API_CATEGORY_MAP } from '../itemLibrary';
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

  type Tab = 'manuell' | 'ki';
  let tab = $state<Tab>('manuell');

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

  let dir = $state(defaultDir || dirs[0] || 'other');

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

  function createManual() {
    const raw = manualName.trim();
    if (!raw || !dir) return;
    const name = raw.charAt(0).toUpperCase() + raw.slice(1);
    openDraft({
      name,
      name_de: name,
      item_type: categoryToItemType(dir),
      equipment_category: { index: dir, name: categoryApiName(dir) },
      desc: [],
      desc_de: [],
      source: 'eigen',
    }, dir);
  }

  // ── KI-Pfad ───────────────────────────────────────────────────────────────
  let description = $state('');
  let steps = $state<AgentStep[]>([]);
  let running = $state(false);
  let error = $state('');
  let abort: AbortController | null = null;

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

  async function generate() {
    if (!description.trim() || running) return;
    running = true;
    error = '';
    steps = [];
    abort = new AbortController();
    try {
      const action = createItemAction();   // ohne Kategorie-Hint — Modell legt sie fest
      const item = await runAiAction<Item>($llmConfig, action, description.trim(), {
        onStep: (s) => { steps = [...steps, s]; },
        signal: abort.signal,
      });
      item.source = 'KI';
      openDraft(item, dirOf(item));
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      running = false;
      abort = null;
    }
  }

  function stop() {
    abort?.abort();
  }
</script>

<div class="dialog" style="left: {pos.x}px; top: {pos.y}px;" role="dialog" aria-label="Neuer Gegenstand">
    <div class="modal-header" onmousedown={startDrag} role="presentation">
      <span class="modal-title">Neuer Gegenstand</span>
      <button class="close-btn" onmousedown={(e) => e.stopPropagation()} onclick={onclose} title="Schließen">×</button>
    </div>

    <div class="tabs">
      <button class="tab" class:active={tab === 'manuell'} onclick={() => (tab = 'manuell')}>Manuell</button>
      <button class="tab" class:active={tab === 'ki'} onclick={() => (tab = 'ki')}>Mit KI</button>
    </div>

    {#if tab === 'manuell'}
      <div class="row">
        <label class="field-label" for="cat-select">Kategorie</label>
        <select id="cat-select" class="select" bind:value={dir}>
          {#each dirs as d}
            <option value={d}>{CATEGORY_LABELS[d] ?? d}</option>
          {/each}
        </select>
      </div>
      <div class="row">
        <label class="field-label" for="name-input">Name</label>
        <input
          id="name-input"
          class="input"
          bind:value={manualName}
          placeholder="z.B. Kriegshammer"
          onkeydown={(e) => { if (e.key === 'Enter') createManual(); }}
        />
      </div>
      <div class="actions">
        <button class="primary-btn" onclick={createManual} disabled={!manualName.trim()}>Anlegen</button>
      </div>

    {:else}
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
        <label class="field-label" for="desc-input">Beschreibung</label>
        <textarea
          id="desc-input"
          class="textarea"
          bind:value={description}
          rows="3"
          placeholder="z.B. Kriegshammer aus Obsidian, schwarz glänzend, mit Runen graviert"
        ></textarea>
      </div>

      <div class="actions">
        {#if running}
          <button class="secondary-btn" onclick={stop}>Abbrechen</button>
        {:else}
          <button class="primary-btn" onclick={generate} disabled={!description.trim() || !canTools}>Generieren</button>
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
    {/if}
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

  .tabs { display: flex; gap: 0.3rem; border-bottom: 1px solid var(--surface); }
  .tab {
    background: none; border: none; border-bottom: 2px solid transparent;
    color: var(--ink-muted); padding: 0.35rem 0.7rem; cursor: pointer; font-family: inherit; font-size: 0.85rem;
  }
  .tab.active { color: var(--ink); border-bottom-color: var(--red); }

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

  .steps { display: flex; flex-direction: column; gap: 0.2rem; max-height: 160px; overflow-y: auto; padding: 0.3rem 0; }
  .step { font-size: 0.78rem; color: var(--ink-soft); }
  .step.muted { color: var(--ink-muted); }

  .hint { font-size: 0.78rem; margin: 0; }
  .hint.warn { color: var(--gold, #c89b3c); }
  .hint.err { color: var(--danger); }
</style>
