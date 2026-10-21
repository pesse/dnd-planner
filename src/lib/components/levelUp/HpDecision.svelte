<script lang="ts">
  /** `hp_method` und `hp_roll` als eine Karte: zwei Kacheln, der Wurf hängt an der zweiten. */
  import type { LevelUpQuestion } from '$lib/schemas/levelUp';
  import type { LevelUpAssistantUi } from './assistantState.svelte';

  let { ui, method, roll }: { ui: LevelUpAssistantUi; method: LevelUpQuestion; roll: LevelUpQuestion | undefined } = $props();

  const chosen = $derived(ui.st.answers[method.id]);
  const sides = $derived(roll?.dieSides ?? 0);
  const count = $derived(Math.max(1, roll?.rollCount ?? 1));
  const average = $derived((Math.floor(sides / 2) + 1) * count);
  const rolls = $derived(roll ? (ui.hpRolls[roll.id] ?? []) : []);
  const perLevel = $derived(count > 1 ? '+ KON-Modifikator je Stufe' : '+ KON-Modifikator');

  function chooseRoll() {
    ui.setIn(method.id, 'roll');
    if (roll && !rolls.length) ui.rollHp(roll);
  }
</script>

<div class="tiles">
  <button type="button" class="tile" class:sel={chosen === 'average'} onclick={() => ui.setIn(method.id, 'average')}>
    <span class="tile-label">Durchschnitt</span>
    <span class="tile-value">{average}</span>
    <span class="tile-sub">{perLevel}</span>
  </button>
  <button type="button" class="tile" class:sel={chosen === 'roll'} onclick={chooseRoll}>
    <span class="tile-label">Würfeln</span>
    <span class="tile-value">{rolls.length ? rolls.reduce((a, b) => a + b, 0) : `${count > 1 ? count : ''}W${sides}`}</span>
    <span class="tile-sub">{rolls.length > 1 ? `${rolls.join(' + ')} ${perLevel}` : perLevel}</span>
  </button>
</div>
{#if chosen === 'roll' && roll}
  <button type="button" class="secondary reroll" onclick={() => ui.rollHp(roll)}>🎲 Neu würfeln</button>
{/if}

<style>
  .reroll { align-self: flex-end; }
</style>
