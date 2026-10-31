<script lang="ts">
  /** Vorschau-Spalte des Imports: was D&D Beyond geliefert hat, vor den Entscheidungen. */
  import type { DdbImportResult } from '../../services/ddbImport/assemble';
  import { ABILITY_KEYS } from '../../services/wizard/pointBuy';

  let { result }: { result: DdbImportResult } = $props();

  const ABILITY_LABEL = { str: 'STÄ', dex: 'GES', con: 'KON', int: 'INT', wis: 'WEI', cha: 'CHA' } as const;
  const c = $derived(result.character);
</script>

<section class="summary">
  <h3>{c.name}</h3>
  <p>{c.classLevel || '—'}</p>
  <p>{c.race || '—'} · {c.background || '—'}</p>
  <div class="abilities">
    {#each ABILITY_KEYS as k}
      <span><b>{ABILITY_LABEL[k]}</b> {c.abilities[k]}</span>
    {/each}
  </div>
  <p class="meta">TP {c.hpMax || '—'} · RK {c.ac || '—'} · Bewegung {c.speed} m</p>
  <p class="meta">{c.inventory.length} Gegenstände · {c.spellcasting.manual?.extra?.length ?? 0} Zauber verknüpft</p>
  {#if c.playerName}<p class="meta">Spieler: {c.playerName}</p>{/if}
</section>

<style>
  .summary { display: flex; flex-direction: column; gap: 0.25rem; }
  h3 { margin: 0 0 0.2rem; font-family: var(--font-display); color: var(--red); }
  p { margin: 0; font-size: 0.88rem; }
  .abilities { display: grid; grid-template-columns: repeat(3, auto); gap: 0.25rem 0.8rem; margin: 0.4rem 0; font-size: 0.85rem; }
  .meta { color: var(--ink-soft); font-size: 0.8rem; }
</style>
