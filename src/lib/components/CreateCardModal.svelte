<script lang="ts" generics="T">
  import { onDestroy, onMount } from 'svelte';
  import { llmConfig } from '../stores/llm';
  import { getClient } from '../services/llmClient';
  import { runAiAction } from '../services/aiActions/runner';
  import { describeAiStep } from '../services/aiActions/describeStep';
  import { newCardDraft } from '../editor/cardEditor.svelte';
  import { activeFile } from '../stores/campaign';
  import { getResource, type DndApiRef } from '../services/dndApi';
  import Modal from './ui/Modal.svelte';
  import AiStatusBanner from './ui/AiStatusBanner.svelte';
  import LlmProviderSelect from './ui/LlmProviderSelect.svelte';
  import { createRunClock } from '../utils/runClock.svelte';
  import type { FileEntry } from '../types';
  import type { AiAction } from '../services/aiActions/types';
  import type { AgentStep } from '../services/vaultTools';

  let {
    type,
    title,
    searchApi,
    mapApi,
    loadApi,
    searchLibrary,
    blank,
    buildAction,
    nameOf,
    extraSelect,
    onCreated,
    onclose,
  }: {
    type: FileEntry['type'];
    title: string;
    /** API-Suche (englischer Begriff). */
    searchApi: (q: string) => Promise<DndApiRef[]>;
    /** Rohe DnD-API-Ressource → Draft (dnd5eapi.co-Pfad in ref.url). Optional, wenn loadApi gesetzt. */
    mapApi?: (data: Record<string, unknown>) => T;
    /**
     * Alternative zum DnD-API-Pfad: lädt einen Treffer selbst (z.B. Open5e v2, wo
     * ref.url der v2-Key ist). Hat Vorrang vor mapApi + getResource.
     */
    loadApi?: (ref: DndApiRef) => Promise<T>;
    /** Optionale Bibliothekssuche (bestehende Vault-Einträge als Vorlage). */
    searchLibrary?: (q: string) => Promise<{ name: string; load: () => Promise<T> }[]>;
    /** Leerer Draft mit gegebenem Namen. */
    blank: (name: string) => T;
    /** KI-Anlage-Aktion. Fehlt → keine KI-Unterstützung. */
    buildAction?: (opts: { name?: string; template?: T }) => AiAction<T>;
    /** Anzeigename eines Drafts (für activeFile-Platzhalter). */
    nameOf: (draft: T) => string;
    /**
     * Optionale typ-spezifische Auswahl (z.B. „Subklasse von" bei Klassen). Wird als
     * Dropdown gezeigt; bei nicht-leerer Auswahl auf den fertigen Draft angewandt —
     * unabhängig vom Anlage-Pfad (manuell/Vorlage/KI). Leere Auswahl lässt den Draft
     * unangetastet (Import-Werte bleiben erhalten).
     */
    extraSelect?: {
      label: string;
      placeholder: string;
      load: () => Promise<{ value: string; label: string }[]>;
      apply: (draft: T, value: string) => void;
    };
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

  // ── Optionale Zusatz-Auswahl (z.B. „Subklasse von") ─────────────────────────
  let extraOptions = $state<{ value: string; label: string }[]>([]);
  let extraValue = $state('');
  onMount(async () => {
    if (extraSelect) extraOptions = await extraSelect.load();
  });

  function capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

  /**
   * Öffnet den (noch ungespeicherten) Draft im Editor und schließt den Dialog.
   * Der Navigations-Guard greift bereits beim Öffnen dieses Dialogs (siehe
   * createMonster/createSpell/openItemModal in der Sidebar), daher hier nicht erneut.
   */
  function openDraft(draft: T) {
    if (extraSelect && extraValue) extraSelect.apply(draft, extraValue);
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
          load: async () => (loadApi ? loadApi(ref) : mapApi!(await getResource(ref.url))),
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
  let userAborted = false;
  let pendingRestart = false;

  const clock = createRunClock(() => running);
  onDestroy(() => abort?.abort());

  let client = $derived(getClient($llmConfig));
  let canTools = $derived(client.capabilities.tools);

  async function generate() {
    if (running || !buildAction) return;
    running = true;
    error = '';
    steps = [];
    userAborted = false;
    abort = new AbortController();
    clock.start();
    try {
      let template: T | undefined;
      if (selectedTemplate) template = await selectedTemplate.load();
      const name = manualName.trim();
      const action = buildAction({ name: name || undefined, template });
      const userInput = description.trim() || 'Erstelle den Datensatz gemäß den Vorgaben.';
      const draft = await runAiAction<T>($llmConfig, action, userInput, {
        onStep: (s) => { steps = [...steps, s]; clock.touch(); },
        onActivity: () => clock.touch(),
        signal: abort.signal,
      });
      openDraft(draft);
    } catch (e) {
      if (!userAborted) error = e instanceof Error ? e.message : String(e);
    } finally {
      clock.stop();
      running = false;
      abort = null;
      if (pendingRestart) { pendingRestart = false; generate(); }
    }
  }

  function stop() { userAborted = true; abort?.abort(); }
  function retry() { pendingRestart = true; userAborted = true; abort?.abort(); }
</script>

<Modal {title} {onclose} contentClass="ai-modal">
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

  {#if extraSelect}
    <div class="row">
      <label class="field-label" for="cc-extra">{extraSelect.label}</label>
      <select id="cc-extra" class="select" bind:value={extraValue}>
        <option value="">{extraSelect.placeholder}</option>
        {#each extraOptions as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
    </div>
  {/if}

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

  {#if buildAction}
  <div class="template ai-block">
    <label class="ai-toggle">
      <input type="checkbox" bind:checked={aiEnabled} />
      <span>KI-Unterstützung</span>
    </label>

    {#if aiEnabled}
      <LlmProviderSelect />

      {#if !canTools}
        <p class="hint warn">Das gewählte Modell unterstützt keine Tools (DnD-API-Suche). Bitte ein Anthropic- oder Groq-Modell wählen.</p>
      {/if}

      <div class="row">
        <label class="field-label" for="cc-prompt">Prompt</label>
        <textarea id="cc-prompt" class="textarea" bind:value={description} rows="3"
          placeholder={selectedTemplate ? 'z.B. als stärkere Elite-Variante' : 'z.B. ein hinterhältiger Goblin-Späher mit Gift'}></textarea>
      </div>

      {#if running}
        <AiStatusBanner text="KI arbeitet… ({clock.elapsedSec}s)" />
      {/if}
      {#if steps.length}
        <div class="steps">
          {#each steps as s}{@const label = describeAiStep(s)}{#if label}<div class="step" class:muted={label.muted}>{label.icon} {label.text}</div>{/if}{/each}
        </div>
      {/if}
      {#if clock.stalled}
        <p class="hint warn">Seit {clock.stalledSec}s keine Antwort — du kannst neu versuchen oder abbrechen.</p>
      {/if}
    {/if}
  </div>
  {/if}

  {#if templateError}<p class="hint err">{templateError}</p>{/if}
  {#if error}<p class="hint err">{error}</p>{/if}

  <div class="actions">
    {#if aiEnabled}
      {#if running}
        {#if clock.stalled}<button class="secondary-btn" onclick={retry}>Neu versuchen</button>{/if}
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
</Modal>

<style>
  .ai-toggle { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: var(--ink-soft); cursor: pointer; user-select: none; }
  .ai-toggle input { accent-color: var(--red); cursor: pointer; }

  .input, .select {
    background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
    color: var(--ink); font-size: 0.85rem; padding: 0.35rem 0.5rem; outline: none; font-family: inherit; width: 100%;
  }
  .input:focus, .select:focus { border-color: var(--red); }

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
