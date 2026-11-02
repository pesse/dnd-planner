<script lang="ts">
  /** Zustände eines Tokens zum An- und Abschalten; aktive zuerst, der Rest eingeklappt. */
  import { CONDITIONS, CONDITION_KEYS } from '../../../schemas/vocabulary';
  import type { Token } from '../../../schemas/battleMap';
  import type { MapEditor } from '../../../services/battleMap/mapEditor.svelte';

  let { editor, token: t }: { editor: MapEditor; token: Token } = $props();

  let open = $state(false);
  const shown = $derived(open ? CONDITION_KEYS : t.conditions);
</script>

<div class="conditions">
  {#each shown as c (c)}
    <button class:on={t.conditions.includes(c)} onclick={() => editor.toggleCondition(t.id, c)}>{CONDITIONS[c]}</button>
  {/each}
  <button class="more" onclick={() => (open = !open)}>{open ? 'Fertig' : t.conditions.length ? '+ Zustand' : '+ Zustand hinzufügen'}</button>
</div>

<style>
  .conditions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  button {
    padding: 0.1rem 0.5rem;
    font-size: 0.75rem;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--ink-soft);
    cursor: pointer;
  }
  button.on {
    background: #5a1e6e;
    border-color: #5a1e6e;
    color: #fff;
  }
  .more {
    border-style: dashed;
    color: var(--ink-muted);
  }
</style>
