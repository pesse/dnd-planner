<script lang="ts">
  /** Zustände eines Tokens: aktive als abwählbare Chips, weitere über ein Menü — beide mit Regeltext. */
  import { CONDITIONS, CONDITION_KEYS, type Condition } from '../../../schemas/vocabulary';
  import type { Token } from '../../../schemas/battleMap';
  import type { MapEditor } from '../../../services/battleMap/mapEditor.svelte';
  import { pinnableTip } from '../tips/pinnableTip';
  import { conditionTip } from '../../ruleTips.svelte';
  import { conditionIconUrl } from '../../../conditionIcon';

  let { editor, token: t }: { editor: MapEditor; token: Token } = $props();

  let open = $state(false);
  let root = $state<HTMLElement>();
  const rest = $derived(CONDITION_KEYS.filter((c) => !t.conditions.includes(c)));

  function add(c: Condition) {
    editor.toggleCondition(t.id, c);
    open = false;
  }

  function outside(e: PointerEvent) {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }
</script>

<svelte:window onpointerdown={outside} onkeydown={(e) => e.key === 'Escape' && (open = false)} />

<div class="conditions" bind:this={root}>
  {#each t.conditions as c (c)}
    <button class="on" use:pinnableTip={conditionTip(c)} onclick={() => editor.toggleCondition(t.id, c)}><img src={conditionIconUrl(c)} alt="" />{CONDITIONS[c]} ✕</button>
  {/each}
  {#if rest.length}
    <button class="more" aria-haspopup="menu" aria-expanded={open} onclick={() => (open = !open)}>
      {t.conditions.length ? '+ Zustand' : '+ Zustand hinzufügen'}
    </button>
  {/if}
  {#if open}
    <div class="menu" role="menu">
      {#each rest as c (c)}
        <button role="menuitem" use:pinnableTip={conditionTip(c)} onclick={() => add(c)}><img src={conditionIconUrl(c)} alt="" />{CONDITIONS[c]}</button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .conditions {
    position: relative;
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
  button img {
    width: 1.1rem;
    height: 1.1rem;
    margin: -0.2rem 0.2rem -0.2rem -0.3rem;
    vertical-align: middle;
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
  .menu {
    position: absolute;
    top: calc(100% + 0.25rem);
    left: 0;
    z-index: 10;
    display: grid;
    grid-template-columns: repeat(3, auto);
    gap: 0.2rem;
    padding: 0.35rem;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 6px 16px rgba(20, 8, 0, 0.3);
  }
  .menu button:hover {
    border-color: #5a1e6e;
    color: #5a1e6e;
  }
</style>
