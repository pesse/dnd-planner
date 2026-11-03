<script lang="ts">
  /** Zustände und Effekte eines Tokens: aktive als abwählbare Chips, weitere über ein Menü — alle mit Regeltext. */
  import { CONDITIONS, CONDITION_KEYS, type Condition } from '../../../schemas/vocabulary';
  import { TOKEN_EFFECTS, TOKEN_EFFECT_KEYS, type Token, type TokenEffect } from '../../../schemas/battleMap';
  import type { MapEditor } from '../../../services/battleMap/mapEditor.svelte';
  import { pinnableTip } from '../tips/pinnableTip';
  import { badgeTip } from '../../ruleTips.svelte';
  import { badgeIconUrl } from '../../../conditionIcon';

  let { editor, token: t }: { editor: MapEditor; token: Token } = $props();

  let open = $state(false);
  let root = $state<HTMLElement>();
  const rest = $derived(CONDITION_KEYS.filter((c) => !t.conditions.includes(c)));
  const restEffects = $derived(TOKEN_EFFECT_KEYS.filter((e) => !t.effects.includes(e)));

  function add(c: Condition) {
    editor.toggleCondition(t.id, c);
    open = false;
  }

  function addEffect(e: TokenEffect) {
    editor.toggleEffect(t.id, e);
    open = false;
  }

  function outside(e: PointerEvent) {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }
</script>

<svelte:window onpointerdown={outside} onkeydown={(e) => e.key === 'Escape' && (open = false)} />

<div class="conditions" bind:this={root}>
  {#each t.effects as e (e)}
    <button class="on {e}" use:pinnableTip={badgeTip(e)} onclick={() => editor.toggleEffect(t.id, e)}><img src={badgeIconUrl(e)} alt="" />{TOKEN_EFFECTS[e]} ✕</button>
  {/each}
  {#each t.conditions as c (c)}
    <button class="on" use:pinnableTip={badgeTip(c)} onclick={() => editor.toggleCondition(t.id, c)}><img src={badgeIconUrl(c)} alt="" />{CONDITIONS[c]} ✕</button>
  {/each}
  {#if rest.length || restEffects.length}
    <button class="more" aria-haspopup="menu" aria-expanded={open} onclick={() => (open = !open)}>
      {t.conditions.length || t.effects.length ? '+ Zustand' : '+ Zustand hinzufügen'}
    </button>
  {/if}
  {#if open}
    <div class="menu" role="menu">
      {#if restEffects.length}
        <p class="group">Effekte</p>
        {#each restEffects as e (e)}
          <button role="menuitem" use:pinnableTip={badgeTip(e)} onclick={() => addEffect(e)}><img src={badgeIconUrl(e)} alt="" />{TOKEN_EFFECTS[e]}</button>
        {/each}
        <p class="group">Zustände</p>
      {/if}
      {#each rest as c (c)}
        <button role="menuitem" use:pinnableTip={badgeTip(c)} onclick={() => add(c)}><img src={badgeIconUrl(c)} alt="" />{CONDITIONS[c]}</button>
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
  button.on.burning {
    background: #9a3b0c;
    border-color: #9a3b0c;
  }
  button.on.concentration {
    background: #17736b;
    border-color: #17736b;
  }
  .group {
    grid-column: 1 / -1;
    margin: 0.2rem 0 0;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-muted);
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
