<script lang="ts">
  /**
   * Die Options-Pools im Aufstieg — derselbe `OptionPoolPicker` wie am Bogen und im Wizard,
   * nur mit dem Regeltext des Merkmals daneben. Keine Fragebogen-Frage: das Kontingent darf
   * offen bleiben, der Checkpoint hängt nicht daran.
   */
  import './levelUp.css';
  import { textWithoutOptions } from '$lib/services/featureText';
  import { poolPicks } from '$lib/services/declaration/optionPool';
  import OptionPoolPicker from '../OptionPoolPicker.svelte';
  import type { LevelUpAssistantUi } from './assistantState.svelte';

  let { ui }: { ui: LevelUpAssistantUi } = $props();
  const st = $derived(ui.st);

  /** Die Optionen stehen im Tooltip des Pickers — im Merkmalstext wären sie eine Wand. */
  const noteOf = (pool: (typeof st.optionPools)[number]): string =>
    textWithoutOptions(
      pool.descDe.trim() || pool.desc.trim(),
      pool.options.flatMap((o) => [o.value, o.labelDe]),
    );
</script>

{#if st.optionPools.length}
  <div class="pools">
    {#each st.optionPools as pool (pool.featureKey)}
      {@const note = noteOf(pool)}
      {@const open = poolPicks(st.optionPicks, pool.featureKey).length < pool.allowance}
      <div class="pool">
        <OptionPoolPicker offer={pool} bind:picks={st.optionPicks} />
        {#if note}
          <details class="p-note" {open}>
            <summary>Regeltext</summary>
            <p>{note}</p>
          </details>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .pools { display: flex; flex-direction: column; gap: 0.6rem; }
  .pool { display: flex; flex-direction: column; gap: 0.25rem; }
  .p-note { font-size: 0.72rem; color: var(--ink-muted); }
  .p-note summary { color: var(--copper); cursor: pointer; }
  .p-note p { margin: 0.25rem 0 0; white-space: pre-line; }
</style>
