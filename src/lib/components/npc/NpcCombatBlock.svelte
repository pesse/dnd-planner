<script lang="ts">
  import type { Npc } from '../../schemas/npc';
  import './npcCard.css';

  let { npc }: { npc: Npc } = $props();
</script>

<div class="section">
  <h3>Kampf</h3>
  <div class="stats-grid">
    <div class="stat">
      <span class="sl">RK</span>
      <input class="sv sv-input" type="number" bind:value={npc.ac} />
    </div>
    <div class="stat">
      <span class="sl">TP</span>
      <input class="sv sv-input wide" bind:value={npc.hp} placeholder="z.B. 27 (5W8+5)" />
    </div>
    <div class="stat">
      <span class="sl">Tempo</span>
      <input class="sv sv-input wide" bind:value={npc.speed} placeholder="z.B. 9 m" />
    </div>
  </div>
</div>

<style>
  .stats-grid {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .stat { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
  .sl { color: var(--ink-muted); font-size: 0.8rem; white-space: nowrap; }
  .sv { font-weight: 600; color: var(--ink); }

  .sv-input {
    background: var(--bg-panel);
    border: 1px solid var(--surface);
    border-radius: 4px;
    color: var(--ink);
    font-size: 0.82rem;
    font-weight: 600;
    font-family: inherit;
    padding: 0.15rem 0.4rem;
    outline: none;
    width: 4rem;
    text-align: right;
  }
  .sv-input.wide { width: 8rem; text-align: left; }
  .sv-input:focus { border-color: var(--red); }
</style>
