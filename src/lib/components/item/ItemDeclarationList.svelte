<script lang="ts">
  /** Die mechanischen Deklarationen eines Gegenstands, auf Karte und im Tooltip. */
  import type { Item } from '$lib/types';
  import { getSpellLibrary, resolveSpell, type SpellInfo } from '$lib/spellLibrary';
  import { itemDeclarationLines } from '$lib/services/itemDeclarations';

  let { item, variant = 'card' }: { item: Item; variant?: 'card' | 'tooltip' } = $props();

  let spells = $state<SpellInfo[]>([]);
  $effect(() => {
    if (!item.grantsCasting?.quotas.length || spells.length) return;
    getSpellLibrary().then((l) => { spells = l; }).catch(() => {});
  });

  const lines = $derived(
    itemDeclarationLines(item, { spellLabel: (n) => (spells.length ? resolveSpell(spells, n)?.name : null) ?? n }),
  );
</script>

{#if lines.length}
  <div class="decl" class:tooltip={variant === 'tooltip'}>
    {#each lines as line}
      <div class="row"><span class="lbl">{line.label}</span><span>{line.text}</span></div>
    {/each}
  </div>
{/if}

<style>
  .decl { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.6rem 1.4rem; font-size: 0.86rem; }
  .row { display: grid; grid-template-columns: 7.5rem 1fr; gap: 0.5rem; line-height: 1.4; }
  .lbl {
    color: var(--ink-muted); font-weight: 600; font-size: 0.78rem;
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  .tooltip { padding: 0.3rem 0 0; font-size: 0.8rem; gap: 0.15rem; }
  .tooltip .row { grid-template-columns: 6.5rem 1fr; }
  .tooltip .lbl { font-size: 0.72rem; }
</style>
