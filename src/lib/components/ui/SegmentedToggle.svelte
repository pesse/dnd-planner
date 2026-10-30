<script lang="ts" generics="T extends string">
  let { options, value, onselect }: {
    options: { id: T; label: string }[];
    value: T;
    onselect: (id: T) => void;
  } = $props();
</script>

<span class="segmented">
  {#each options as o (o.id)}
    <button type="button" class:active={o.id === value} onclick={() => onselect(o.id)}>{o.label}</button>
  {/each}
</span>

<style>
  .segmented {
    display: inline-flex;
    align-items: center;
    gap: 0.3em;
  }
  button {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink-soft);
    padding: 0.1em 0.6em;
    font: inherit;
    cursor: pointer;
  }
  button:hover {
    color: var(--ink);
  }
  button.active {
    background: var(--arcane);
    border-color: var(--arcane);
    color: var(--bg);
  }
</style>
