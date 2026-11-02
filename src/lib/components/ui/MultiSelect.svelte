<script lang="ts">
  /** Aufklappliste mit Häkchen; nichts gewählt heißt „Alle". */
  let { options, selected, onchange }: {
    options: { id: string; label: string }[];
    selected: string[];
    onchange: (ids: string[]) => void;
  } = $props();

  let open = $state(false);
  let root = $state<HTMLElement>();

  const summary = $derived.by(() => {
    const labels = options.filter((o) => selected.includes(o.id)).map((o) => o.label);
    if (!labels.length) return 'Alle';
    return labels.length <= 2 ? labels.join(', ') : `${labels[0]} +${labels.length - 1}`;
  });

  function toggle(id: string, on: boolean) {
    onchange(on ? [...selected, id] : selected.filter((s) => s !== id));
  }

  function closeOutside(e: MouseEvent) {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }
</script>

<svelte:window onclick={closeOutside} onkeydown={(e) => e.key === 'Escape' && (open = false)} />

<span class="multi" bind:this={root}>
  <button type="button" class="trigger" class:active={selected.length > 0} aria-expanded={open} onclick={() => (open = !open)}>
    {summary} <span class="caret">▾</span>
  </button>
  {#if open}
    <div class="menu" role="listbox" aria-multiselectable="true">
      <button type="button" class="all" disabled={!selected.length} onclick={() => onchange([])}>Alle</button>
      {#each options as o (o.id)}
        <label class="opt">
          <input type="checkbox" checked={selected.includes(o.id)} onchange={(e) => toggle(o.id, e.currentTarget.checked)} />
          {o.label}
        </label>
      {/each}
    </div>
  {/if}
</span>

<style>
  .multi { position: relative; }

  .trigger {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink);
    padding: 0.25rem 0.4rem;
    font: inherit;
    cursor: pointer;
    white-space: nowrap;
  }
  .trigger.active { border-color: var(--red); }
  .caret { font-size: 0.7em; color: var(--ink-muted); }

  .menu {
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    z-index: 20;
    min-width: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 4px;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
    padding: 0.25rem 0;
  }

  .opt, .all {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.2rem 0.6rem;
    color: var(--ink);
    white-space: nowrap;
    cursor: pointer;
  }
  .opt:hover, .all:hover:not(:disabled) { background: var(--surface); }

  .all {
    background: none;
    border: none;
    border-bottom: 1px solid var(--surface);
    font: inherit;
    text-align: left;
  }
  .all:disabled { color: var(--ink-muted); cursor: default; }
</style>
