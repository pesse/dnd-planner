<script lang="ts" generics="T extends { index: string; name: string; url: string; tag?: string }">
  let {
    placeholder = 'Name suchen…',
    onsearch,
    onselect,
  }: {
    placeholder?: string;
    onsearch: (q: string) => Promise<T[]>;
    onselect: (result: T) => void;
  } = $props();

  let query = $state('');
  let results = $state<T[]>([]);
  let searching = $state(false);
  let error = $state('');

  async function search() {
    const q = query.trim();
    if (!q) return;
    searching = true;
    error = '';
    results = [];
    try {
      results = await onsearch(q);
    } catch (e) {
      error = `API-Fehler: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      searching = false;
    }
  }

  function handleSelect(r: T) {
    onselect(r);
    query = '';
    results = [];
  }
</script>

<div class="dnas-section">
  <span class="dnas-label">Aus DnD-API laden</span>
  <div class="dnas-search-row">
    <input
      class="dnas-input"
      bind:value={query}
      {placeholder}
      onkeydown={(e) => { if (e.key === 'Enter') search(); }}
    />
    <button class="dnas-search-btn" onclick={search} disabled={searching}>
      {searching ? '…' : 'Suchen'}
    </button>
  </div>
  {#if error}<span class="dnas-error">{error}</span>{/if}
  {#if results.length}
    <div class="dnas-results">
      {#each results as r}
        <button class="dnas-result" onclick={() => handleSelect(r)}>
          <span class="dnas-result-name">{r.name}</span>
          {#if r.tag}
            <span class="dnas-result-tag">{r.tag}</span>
          {:else}
            <span class="dnas-result-index">({r.index})</span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .dnas-section {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--surface);
    margin-top: 0.25rem;
  }

  .dnas-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-muted);
  }

  .dnas-search-row { display: flex; gap: 0.4rem; }

  .dnas-input {
    flex: 1;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink);
    font-size: 0.82rem;
    padding: 0.25rem 0.5rem;
    outline: none;
    font-family: inherit;
  }
  .dnas-input:focus { border-color: var(--cat-color, var(--red)); }

  .dnas-search-btn {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink-soft);
    font-size: 0.82rem;
    padding: 0.2rem 0.7rem;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    font-family: inherit;
  }
  .dnas-search-btn:hover:not(:disabled) { color: var(--cat-color, var(--red)); border-color: var(--cat-color, var(--red)); }
  .dnas-search-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .dnas-error { font-size: 0.78rem; color: var(--danger); }

  .dnas-results {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    max-height: 200px;
    overflow-y: auto;
  }

  .dnas-result {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink);
    font-size: 0.82rem;
    padding: 0.3rem 0.6rem;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    gap: 0.5rem;
  }
  .dnas-result:hover { border-color: var(--cat-color, var(--red)); color: var(--cat-color, var(--red)); }

  .dnas-result-name { font-weight: 500; flex: 1; }
  .dnas-result-tag {
    font-size: 0.7rem;
    color: var(--ink-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    flex-shrink: 0;
  }
  .dnas-result-index { color: var(--ink-muted); font-size: 0.75rem; flex-shrink: 0; }
</style>
