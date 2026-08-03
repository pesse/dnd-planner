<script lang="ts">
  import type { Snippet } from 'svelte';

  type Tab = 'karte' | 'bearbeiten' | 'json' | (string & {});

  let {
    tab = $bindable<Tab>('bearbeiten'),
    dirty = false,
    saveError = '',
    onsave,
    ondiscard,
    onsavejson,
    getJson = (): string => '',
    karte,
    bearbeiten,
    tabactions,
    extraTabs = [],
    extra,
    saveBarAllTabs = false,
    style = '',
  }: {
    tab?: Tab;
    dirty?: boolean;
    saveError?: string;
    style?: string;
    onsave?: () => void;
    ondiscard?: () => void;
    onsavejson?: (json: string) => Promise<void> | void;
    getJson?: () => string;
    karte?: Snippet;
    bearbeiten?: Snippet;
    tabactions?: Snippet;
    /** Extra-Tabs verwalten ihr Speichern selbst — keine gemeinsame Save-Bar. */
    extraTabs?: { id: string; label: string }[];
    extra?: Snippet<[string]>;
    /** Opt-in für Karten, die den Draft auch außerhalb des Bearbeiten-Tabs ändern. */
    saveBarAllTabs?: boolean;
  } = $props();

  const isExtraTab = $derived(extraTabs.some((t) => t.id === tab));

  let rawJson  = $state('');
  let jsonError = $state('');
  let jsonTouched = $state(false);
  let jsonStale = $state(false);
  let lastSynced = $state('');

  // Der Rohtext folgt dem Draft nur, solange niemand hineingetippt hat: sonst verschluckt
  // ein Speichern aus dem JSON-Tab, was nebenan (Seitenleiste) entstanden ist.
  $effect(() => {
    if (tab !== 'json') return;
    const fresh = getJson();
    if (fresh === lastSynced) return;
    if (jsonTouched) { jsonStale = true; return; }
    rawJson = fresh;
    lastSynced = fresh;
  });

  function syncJson() {
    rawJson = getJson();
    lastSynced = rawJson;
    jsonTouched = false;
    jsonStale = false;
    jsonError = '';
  }

  function switchTab(t: Tab) {
    if (t === 'json') syncJson();
    tab = t;
  }

  async function saveJson() {
    try {
      JSON.parse(rawJson);  // Validierung
      jsonError = '';
      await onsavejson?.(rawJson);
      tab = 'bearbeiten';
    } catch (e) {
      jsonError = `Ungültiges JSON: ${e}`;
    }
  }
</script>

<div class="editor-panel" {style}>
  <div class="sticky-header">
    <div class="tab-bar">
      <button class="tab-btn" class:active={tab === 'karte'}      onclick={() => switchTab('karte')}>Karte</button>
      <button class="tab-btn" class:active={tab === 'bearbeiten'} onclick={() => switchTab('bearbeiten')}>Bearbeiten</button>
      {#each extraTabs as t (t.id)}
        <button class="tab-btn" class:active={tab === t.id} onclick={() => switchTab(t.id)}>{t.label}</button>
      {/each}
      <button class="tab-btn" class:active={tab === 'json'}       onclick={() => switchTab('json')}>JSON</button>
      {#if tabactions}
        <div class="tab-actions">{@render tabactions()}</div>
      {/if}
    </div>

    {#if dirty && (saveBarAllTabs || (tab !== 'karte' && !isExtraTab))}
      <div class="save-bar">
        {#if saveError}<span class="save-error">{saveError}</span>{/if}
        <button class="save-btn"   onclick={tab === 'json' ? saveJson : onsave}>Speichern</button>
        <button class="cancel-btn" onclick={ondiscard}>Verwerfen</button>
      </div>
    {/if}
  </div>

  {#if tab === 'karte'}
    {@render karte?.()}
  {:else if tab === 'bearbeiten'}
    {@render bearbeiten?.()}
  {:else if tab === 'json'}
    <div class="json-editor">
      {#if jsonError}<div class="json-error-bar">{jsonError}</div>{/if}
      {#if jsonStale}
        <div class="json-stale-bar">
          Der Entwurf hat sich seit dem Öffnen geändert — dieser Text ist nicht mehr aktuell.
          <button class="json-reload-btn" onclick={syncJson}>Neu laden</button>
        </div>
      {/if}
      <textarea class="json-textarea" bind:value={rawJson} spellcheck="false"
        oninput={() => (jsonTouched = true)}></textarea>
      <div class="json-actions">
        <button class="save-btn"   onclick={saveJson}>Speichern</button>
        <button class="cancel-btn" onclick={() => switchTab('bearbeiten')}>Abbrechen</button>
      </div>
    </div>
  {:else if isExtraTab}
    {@render extra?.(tab)}
  {/if}
</div>

<style>
  .editor-panel {
    flex: 1;
    min-height: 0;
    /* Der Charakter setzt das Panel in eine ZEILE neben die Merkmals-Leiste; ohne
       `min-width: 0` überliefe es sie, statt beim Ziehen schmaler zu werden. */
    min-width: 0;
    overflow-y: auto;
    padding: 0 1.5rem 1.5rem;
    background: var(--bg);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  /* Volle Panel-Breite mit opakem Hintergrund, damit der Inhalt sauber darunter
     durchscrollt; die inneren Leisten bleiben über `max-width` mittig. */
  .sticky-header {
    position: sticky;
    top: 0;
    z-index: 10;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding-top: 0.75rem;
    background: var(--bg);
  }

  /* Karten haben `overflow: hidden`, ihre automatische Mindesthöhe fällt damit auf 0:
     ohne dieses `flex-shrink: 0` würden sie gestaucht statt das Panel zu überlaufen,
     und der untere Karteninhalt verschwände unerreichbar. */
  .editor-panel > :global(*) { flex-shrink: 0; }

  .tab-bar {
    display: flex;
    align-items: center;
    width: 100%;
    max-width: 560px;
    border-bottom: 1px solid var(--surface);
    margin-bottom: 0.25rem;
  }

  .tab-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    padding-bottom: 1px;
  }

  .tab-btn {
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--ink-muted);
    cursor: pointer;
    font-size: 0.82rem;
    padding: 0.3rem 0.85rem;
    margin-bottom: -1px;
    transition: color 0.1s, border-color 0.1s;
    font-family: inherit;
  }
  .tab-btn:hover { color: var(--ink); }
  .tab-btn.active {
    color: var(--ep-accent, var(--red));
    border-bottom-color: var(--ep-accent, var(--red));
  }

  .save-bar {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    background: var(--bg-raised);
    border: 1px solid var(--red);
    border-radius: 4px;
    padding: 0.4rem 0.75rem;
    width: 100%;
    max-width: 560px;
  }

  .save-error { flex: 1; color: var(--danger); font-size: 0.8rem; }

  .save-btn {
    background: var(--green);
    color: var(--bg);
    border: none;
    border-radius: 4px;
    padding: 0.25rem 0.75rem;
    cursor: pointer;
    font-size: 0.82rem;
    font-weight: 600;
    font-family: inherit;
  }
  .save-btn:hover { background: var(--green); }

  .cancel-btn {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--ink-muted);
    border-radius: 4px;
    padding: 0.25rem 0.75rem;
    cursor: pointer;
    font-size: 0.82rem;
    font-family: inherit;
  }
  .cancel-btn:hover { color: var(--danger); }

  .json-editor {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 700px;
    gap: 0.5rem;
  }

  .json-error-bar { color: var(--danger); font-size: 0.8rem; padding: 0.2rem 0; }

  .json-stale-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    font-size: 0.78rem;
    color: var(--gold);
    border: 1px solid color-mix(in srgb, var(--gold) 45%, var(--bg));
    border-radius: 4px;
    padding: 0.3rem 0.6rem;
  }
  .json-reload-btn {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--ink);
    border-radius: 4px;
    padding: 0.15rem 0.5rem;
    font-size: 0.76rem;
    font-family: inherit;
    cursor: pointer;
    flex-shrink: 0;
  }
  .json-reload-btn:hover { border-color: var(--gold); color: var(--gold); }

  .json-textarea {
    min-height: 560px;
    background: var(--bg-panel);
    border: 1px solid var(--surface);
    border-radius: 4px;
    color: var(--ink);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.82rem;
    padding: 1rem;
    outline: none;
    resize: vertical;
    line-height: 1.6;
  }

  .json-actions { display: flex; gap: 0.5rem; }
</style>
