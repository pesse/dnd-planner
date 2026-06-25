<script lang="ts">
  import type { Snippet } from 'svelte';

  // Bekannte Standard-Tabs + beliebige Extra-Tab-Ids (z.B. 'details', 'notes').
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
    style = '',
  }: {
    tab?: Tab;
    dirty?: boolean;
    saveError?: string;
    /** Inline-Styles für den Wurzel-Container (z. B. --ep-accent) */
    style?: string;
    onsave?: () => void;
    ondiscard?: () => void;
    /** Wird mit validiertem JSON aufgerufen; wirft bei Fehler → zeigt jsonError */
    onsavejson?: (json: string) => Promise<void> | void;
    /** Liefert den aktuellen Draft-JSON-String beim Wechsel auf JSON-Tab */
    getJson?: () => string;
    karte?: Snippet;
    bearbeiten?: Snippet;
    /** Optionale Aktionen rechts in der Tab-Leiste */
    tabactions?: Snippet;
    /**
     * Zusätzliche Tabs neben Karte/Bearbeiten/JSON (z.B. eigene .md-Dateien).
     * Default leer → unverändertes 3-Tab-Verhalten. Extra-Tabs verwalten ihr
     * Speichern selbst (keine gemeinsame Save-Bar).
     */
    extraTabs?: { id: string; label: string }[];
    /** Inhalt eines Extra-Tabs; bekommt die aktive Tab-Id. */
    extra?: Snippet<[string]>;
  } = $props();

  const isExtraTab = $derived(extraTabs.some((t) => t.id === tab));

  let rawJson  = $state('');
  let jsonError = $state('');

  function switchTab(t: Tab) {
    if (t === 'json') {
      rawJson   = getJson();
      jsonError = '';
    }
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
  <!-- Sticky-Kopf: Tab-Leiste + Speichern-Leiste bleiben beim Scrollen sichtbar -->
  <div class="sticky-header">
    <!-- Tab-Leiste -->
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

    <!-- Speichern-Leiste (nur für den character.json-Draft: nicht auf Karte und nicht in Extra-Tabs) -->
    {#if dirty && tab !== 'karte' && !isExtraTab}
      <div class="save-bar">
        {#if saveError}<span class="save-error">{saveError}</span>{/if}
        <button class="save-btn"   onclick={tab === 'json' ? saveJson : onsave}>Speichern</button>
        <button class="cancel-btn" onclick={ondiscard}>Verwerfen</button>
      </div>
    {/if}
  </div>

  <!-- Tab-Inhalte -->
  {#if tab === 'karte'}
    {@render karte?.()}
  {:else if tab === 'bearbeiten'}
    {@render bearbeiten?.()}
  {:else if tab === 'json'}
    <div class="json-editor">
      {#if jsonError}<div class="json-error-bar">{jsonError}</div>{/if}
      <textarea class="json-textarea" bind:value={rawJson} spellcheck="false"></textarea>
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
    overflow-y: auto;
    padding: 0 1.5rem 1.5rem;
    background: var(--bg);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  /*
   * Sticky-Kopf: Tab-Leiste + Speichern-Leiste bleiben beim vertikalen Scrollen
   * langer Inhalte oben sichtbar. Volle Panel-Breite mit opakem Hintergrund,
   * damit der Inhalt sauber darunter durchscrollt; innere Leisten bleiben
   * weiterhin mittig (max-width).
   */
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

  /*
   * Direkte Kinder (Karten via Snippet, JSON-Editor) dürfen im Flex-Container
   * nicht schrumpfen: Karten haben `overflow: hidden`, wodurch ihre automatische
   * Mindesthöhe auf 0 fällt und sie bei kleiner Fensterhöhe zusammengedrückt
   * würden — der untere Karteninhalt (z.B. DnD-API/Übersetzen) verschwände,
   * ohne dass der Scroll-Container überläuft. flex-shrink:0 erhält die volle
   * Kartenhöhe, sodass overflow-y des Panels greift und vertikal gescrollt wird.
   */
  .editor-panel > :global(*) { flex-shrink: 0; }

  /* ── Tab-Leiste ── */
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

  /* ── Speichern-Leiste ── */
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

  /* ── JSON-Editor ── */
  .json-editor {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 700px;
    gap: 0.5rem;
  }

  .json-error-bar { color: var(--danger); font-size: 0.8rem; padding: 0.2rem 0; }

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
