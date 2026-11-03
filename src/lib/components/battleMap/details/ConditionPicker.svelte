<script lang="ts">
  /** Zustände eines Tokens: aktive als abwählbare Chips, weitere über ein Auswahlmenü. */
  import { CONDITIONS, CONDITION_KEYS, type Condition } from '../../../schemas/vocabulary';
  import type { Token } from '../../../schemas/battleMap';
  import type { MapEditor } from '../../../services/battleMap/mapEditor.svelte';

  let { editor, token: t }: { editor: MapEditor; token: Token } = $props();

  const rest = $derived(CONDITION_KEYS.filter((c) => !t.conditions.includes(c)));

  function add(e: Event) {
    const select = e.currentTarget as HTMLSelectElement;
    if (select.value) editor.toggleCondition(t.id, select.value as Condition);
    select.value = '';
  }
</script>

<div class="conditions">
  {#each t.conditions as c (c)}
    <button class="on" title="Zustand entfernen" onclick={() => editor.toggleCondition(t.id, c)}>{CONDITIONS[c]} ✕</button>
  {/each}
  {#if rest.length}
    <select class="more" aria-label="Zustand hinzufügen" onchange={add}>
      <option value="">{t.conditions.length ? '+ Zustand' : '+ Zustand hinzufügen'}</option>
      {#each rest as c (c)}<option value={c}>{CONDITIONS[c]}</option>{/each}
    </select>
  {/if}
</div>

<style>
  .conditions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  button,
  select {
    padding: 0.1rem 0.5rem;
    font-size: 0.75rem;
    border-radius: 999px;
    cursor: pointer;
  }
  button.on {
    background: #5a1e6e;
    border: 1px solid #5a1e6e;
    color: #fff;
  }
  .more {
    appearance: none;
    background: var(--bg-raised);
    border: 1px dashed var(--border);
    color: var(--ink-muted);
  }
  .more option {
    color: var(--ink);
    background: var(--bg-panel);
  }
</style>
