<script lang="ts">
  import type { Spell } from '../types';
  import { SCHOOL_COLORS } from '../spellLibrary';
  import SpellDetail from './SpellDetail.svelte';

  let { spell, x, y }: { spell: Spell | null; x: number; y: number } = $props();

  let winW = $state(1280);
  let winH = $state(800);
  let boxW = $state(0);
  let boxH = $state(0);

  // x/y ist der vom Aufrufer bereits gesetzte Anker (Cursor + Offset), wie
  // beim Item-Tooltip. Am Viewport-Rand klappen wir um/begrenzen, damit lange
  // Zauberbeschreibungen nicht abgeschnitten werden.
  const left = $derived(x + boxW > winW ? Math.max(8, x - boxW - 28) : x);
  const top  = $derived(Math.max(8, Math.min(y, winH - boxH - 8)));

</script>

<svelte:window bind:innerWidth={winW} bind:innerHeight={winH} />

{#if spell}
  {@const color = SCHOOL_COLORS[spell.school] ?? 'var(--arcane)'}
  <div
    class="spell-tooltip"
    style="left:{left}px;top:{top}px;--sc:{color}"
    bind:clientWidth={boxW}
    bind:clientHeight={boxH}
  >
    <SpellDetail {spell} />
  </div>
{/if}

<style>
  .spell-tooltip {
    position: fixed;
    z-index: 9999;
    pointer-events: none;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-left: 3px solid var(--sc);
    border-radius: 6px;
    padding: 0.7rem 0.9rem;
    min-width: 220px;
    width: max-content;
    max-width: 360px;
    max-height: 80vh;
    overflow: hidden;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
    font-size: 0.8rem;
    color: var(--ink);
  }

</style>
