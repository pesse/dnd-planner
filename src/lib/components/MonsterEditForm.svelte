<script lang="ts">
  import type { Monster } from '../types';
  import MonsterHeaderFields from './monster/MonsterHeaderFields.svelte';
  import MonsterMovementFields from './monster/MonsterMovementFields.svelte';
  import MonsterStatsGrid from './monster/MonsterStatsGrid.svelte';
  import MonsterDefensesSection from './monster/MonsterDefensesSection.svelte';
  import MonsterAbilityEditList from './monster/MonsterAbilityEditList.svelte';
  import MonsterActionEditList from './monster/MonsterActionEditList.svelte';
  import './monster/monsterEditForm.css';

  let {
    monster = $bindable<Monster>(),
    onchange = () => void 0,
  }: {
    monster: Monster;
    onchange?: () => void;
  } = $props();
</script>

<div class="mef">
  <MonsterHeaderFields {monster} {onchange} />

  <div class="divider"></div>

  <MonsterMovementFields {monster} {onchange} />

  <div class="divider"></div>

  <MonsterStatsGrid {monster} {onchange} />

  <div class="divider"></div>

  <MonsterDefensesSection {monster} {onchange} />

  <div class="divider"></div>
  <MonsterAbilityEditList bind:items={monster.traits} heading="Eigenschaften" placeholder="Eigenschaft" addLabel="Eigenschaft" {onchange} />

  <div class="divider"></div>
  <MonsterActionEditList bind:items={monster.actions} {onchange} />
</div>

<style>
  /* Trägt nur die Sichtbarkeit von monsterEditForm.css — `display: contents`, weil die
     Abschnitte weiterhin direkte Kinder des Rahmens sein müssen (MonsterMiniCard
     verteilt sie per flex-gap auf `.sb-full`). */
  .mef { display: contents; }
</style>
