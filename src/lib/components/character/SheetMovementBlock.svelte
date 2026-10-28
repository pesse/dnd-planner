<script lang="ts">
  import './sheet.css';
  import type { MovementLine } from '../../services/movement';

  let { lines }: { lines: MovementLine[] } = $props();
</script>

<div class="section">
  <h3>Bewegung &amp; Sinne</h3>
  <ul class="movement">
    {#each lines as l}
      <li>
        <strong>{l.labelDe}</strong> {l.valueDe}{#if l.whenDe}<span class="when"> – {l.whenDe}</span>{/if}
        <span class="source">({l.sourcesDe.join(', ')})</span>
      </li>
    {/each}
  </ul>
</div>

<style>
  .movement { margin: 0; padding-left: 1.1rem; font-size: 0.85rem; color: var(--ink); }
  strong { font-weight: 600; }
  .when { color: var(--ink-soft); font-style: italic; }
  .source { color: var(--ink-soft); font-size: 0.78rem; }
</style>
