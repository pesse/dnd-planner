<script lang="ts">
  import { ABILITY_ABBR_DE, ABILITY_KEYS, type AbilityKey } from '$lib/schemas/abilities';

  let { selected = $bindable(), hint = '' }: { selected: AbilityKey[]; hint?: string } = $props();

  function toggle(k: AbilityKey, on: boolean) {
    selected = on ? ABILITY_KEYS.filter((x) => x === k || selected.includes(x)) : selected.filter((x) => x !== k);
  }
</script>

<span class="checks">
  {#each ABILITY_KEYS as k}
    <label class="edit-check">
      <input type="checkbox" checked={selected.includes(k)} onchange={(e) => toggle(k, (e.target as HTMLInputElement).checked)} />
      {ABILITY_ABBR_DE[k]}
    </label>
  {/each}
  {#if hint}<span class="hint">{hint}</span>{/if}
</span>

<style>
  .checks { display: inline-flex; flex-wrap: wrap; gap: 0.2rem 0.6rem; align-items: center; }
  .hint { font-size: 0.75rem; color: var(--ink-muted); font-style: italic; }
</style>
