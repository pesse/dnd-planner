<script lang="ts">
  /** `hp_method` und `hp_roll` als eine Karte: zwei Kacheln, der Wurf hängt an der zweiten. */
  import type { LevelUpQuestion } from '$lib/schemas/levelUp';
  import Die from '../ui/die/Die.svelte';
  import { classColor } from '$lib/domain/classColors';
  import type { LevelUpAssistantUi } from './assistantState.svelte';

  let { ui, method, roll }: { ui: LevelUpAssistantUi; method: LevelUpQuestion; roll: LevelUpQuestion | undefined } = $props();

  const chosen = $derived(ui.st.answers[method.id]);
  const sides = $derived(roll?.dieSides ?? 0);
  const count = $derived(Math.max(1, roll?.rollCount ?? 1));
  const average = $derived((Math.floor(sides / 2) + 1) * count);
  const rolls = $derived(roll ? (ui.hpRolls[roll.id] ?? []) : []);
  const perLevel = $derived(count > 1 ? '+ KON-Modifikator je Stufe' : '+ KON-Modifikator');

  let throws = $state(0);

  function rollDice() {
    if (!roll) return;
    ui.rollHp(roll);
    throws++;
  }

  function chooseRoll() {
    ui.setIn(method.id, 'roll');
    if (!rolls.length) rollDice();
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
    <span class="tile-sub">{perLevel}</span>
  </button>
</div>
{#if chosen === 'roll' && roll && rolls.length}
  <div class="tray">
    <div class="dice">
      {#each rolls as r, i (i)}<Die {sides} value={r} roll={throws} delay={i * 90} color={classColor(ui.selectedClassKey)} />{/each}
    </div>
    <button type="button" class="secondary" onclick={rollDice}>Neu würfeln</button>
  </div>
{/if}

<style>
  .tray {
    display: flex; align-items: center; justify-content: space-between; gap: 0.8rem; flex-wrap: wrap;
    padding: 0.6rem 0.8rem; border-radius: 8px;
    background: radial-gradient(ellipse at 50% 40%, color-mix(in srgb, var(--gold) 14%, var(--surface)) 0%, var(--surface) 75%);
    box-shadow: inset 0 2px 8px rgba(60, 35, 5, 0.25);
  }
  .dice { display: flex; flex-wrap: wrap; gap: 0.6rem; }
</style>
