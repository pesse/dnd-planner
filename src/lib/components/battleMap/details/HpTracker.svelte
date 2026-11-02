<script lang="ts">
  /** TP eines Monster-Tokens: Balken, Schaden und Heilung. */
  import type { Token } from '../../../schemas/battleMap';
  import type { MapEditor } from '../../../services/battleMap/mapEditor.svelte';
  import { adjustHp } from '../../../services/battleMap/tokenDetails';

  let { editor, token: t, fallbackMax }: { editor: MapEditor; token: Token; fallbackMax: number } = $props();

  let amount = $state<number | null>(null);
  const hpMax = $derived(t.hpMax ?? fallbackMax);
  const hp = $derived(t.hp ?? hpMax);

  function changeHp(sign: 1 | -1) {
    if (!amount) return;
    editor.checkpoint();
    editor.updateToken(t.id, adjustHp(t, hpMax, sign * amount));
    amount = null;
  }
</script>

{#if hpMax}
  <div class="hp" class:down={hp === 0}>
    <div class="line">
      <span class="value">{hp} / {hpMax} TP{hp === 0 ? ' · besiegt' : ''}</span>
      <div class="bar"><span style="width: {(100 * hp) / hpMax}%"></span></div>
    </div>
    <div class="line">
      <input
        type="number"
        min="1"
        placeholder="Wert"
        aria-label="TP-Änderung"
        bind:value={amount}
        onkeydown={(e) => e.key === 'Enter' && changeHp(e.shiftKey ? 1 : -1)}
      />
      <button class="dmg" title="Schaden (Enter)" onclick={() => changeHp(-1)}>− Schaden</button>
      <button title="Heilung (Umschalt+Enter)" onclick={() => changeHp(1)}>+ Heilung</button>
    </div>
  </div>
{/if}

<style>
  .hp {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .value {
    min-width: 6.5rem;
    font-weight: 600;
    font-size: 0.9rem;
  }
  .down .value {
    color: var(--danger);
  }
  .bar {
    flex: 1;
    height: 0.55rem;
    border-radius: 3px;
    background: var(--surface);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--red);
    transition: width 0.2s;
  }
  input {
    width: 4.5rem;
  }
  button {
    flex: 1;
    background: none;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink-soft);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0.2rem 0.4rem;
  }
  .dmg {
    color: var(--danger);
  }
</style>
