<script lang="ts">
  import type { Monster } from '../types';
  import MonsterHeaderFields from './monster/MonsterHeaderFields.svelte';
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

  <MonsterStatsGrid {monster} {onchange} />

  <div class="divider"></div>

  <MonsterDefensesSection {monster} {onchange} />

  {#if monster.traits.length || true}
    <div class="divider"></div>
    <MonsterAbilityEditList bind:items={monster.traits} placeholder="Eigenschaft" addLabel="Eigenschaft" {onchange} />
  {/if}

  <div class="divider"></div>
  <MonsterActionEditList bind:items={monster.actions} {onchange} />

  {#if monster.reactions.length || true}
    <div class="divider"></div>
    <MonsterAbilityEditList bind:items={monster.reactions} heading="Reaktionen" placeholder="Reaktion" addLabel="Reaktion" {onchange} />
  {/if}

  {#if monster.legendary_actions.length || true}
    <div class="divider"></div>
    <MonsterAbilityEditList bind:items={monster.legendary_actions} heading="Legendäre Aktionen" placeholder="Legendäre Aktion" addLabel="Legendäre Aktion" {onchange} />
  {/if}
</div>

<style>
  /* Trägt nur die Sichtbarkeit von monsterEditForm.css — `display: contents`, weil die
     Abschnitte weiterhin direkte Kinder des Rahmens sein müssen (MonsterMiniCard
     verteilt sie per flex-gap auf `.sb-full`). */
  .mef { display: contents; }
</style>
