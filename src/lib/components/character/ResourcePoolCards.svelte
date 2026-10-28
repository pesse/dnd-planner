<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ResourceView } from '../../services/resources/project';

  let { resources, children }: {
    resources: ResourceView[];
    /** Unter den Zellen einer Kachel, etwa die Anpassungen im Editor. */
    children?: Snippet<[ResourceView]>;
  } = $props();
</script>

<div class="pools">
  {#each resources as pool (pool.id)}
    <div class="pool">
      <div class="pool-head">
        <span class="pool-label">{pool.label}</span>
        {#if pool.hint}<span class="pool-hint">{pool.hint}</span>{/if}
      </div>
      <div class="pool-cells">
        {#each pool.cells as cell (cell.label)}
          <span class="cell">
            <span class="count">{cell.count}</span>
            {#if cell.label}<span class="cell-label">{cell.label}</span>{/if}
          </span>
        {/each}
      </div>
      {@render children?.(pool)}
    </div>
  {/each}
</div>

<style>
  .pools { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0.4rem 0 0.5rem; }
  .pool {
    background: var(--surface);
    border-radius: 6px;
    padding: 0.4rem 0.6rem 0.5rem;
    min-width: 10rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .pool-head { display: flex; align-items: baseline; justify-content: space-between; gap: 0.75rem; }
  .pool-label { font-weight: 600; font-size: 0.82rem; }
  .pool-hint { font-size: 0.68rem; color: var(--ink-muted); white-space: nowrap; }
  .pool-cells { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .cell {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    min-width: 2.6rem;
    padding: 0.15rem 0.35rem;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .count { font-size: 1.05rem; font-weight: 700; color: var(--arcane); }
  .cell-label { font-size: 0.62rem; color: var(--ink-muted); }
</style>
