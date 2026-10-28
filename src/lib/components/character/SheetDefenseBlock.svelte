<script lang="ts">
  import './sheet.css';
  import { defenseTextDe, defenseWhenDe, type CharacterDefense } from '../../services/defenses';

  let { defenses }: { defenses: CharacterDefense[] } = $props();
</script>

<div class="section">
  <h3>Resistenzen &amp; Immunitäten</h3>
  <ul class="defenses">
    {#each defenses as d}
      <li>
        {defenseTextDe(d.effect)}{#if defenseWhenDe(d.effect)}<span class="when"> – {defenseWhenDe(d.effect)}</span>{/if}
        <span class="source">({d.labelDe})</span>
      </li>
    {/each}
  </ul>
</div>

<style>
  .defenses { margin: 0; padding-left: 1.1rem; font-size: 0.85rem; color: var(--ink); }
  .when { color: var(--ink-soft); font-style: italic; }
  .source { color: var(--ink-soft); font-size: 0.78rem; }
</style>
