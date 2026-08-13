<script lang="ts">
  import type { MonsterAction, MonsterAttack } from '../../types';
  import { ACTION_GROUP_LABELS } from '../../services/monsterFormat';
  import MonsterAttackFields from './MonsterAttackFields.svelte';
  import './monsterEditForm.css';

  let {
    items = $bindable<MonsterAction[]>(),
    onchange,
  }: {
    items: MonsterAction[];
    onchange: () => void;
  } = $props();

  const USAGE_TYPES = [
    { value: 'PER_DAY', label: 'pro Tag' },
    { value: 'RECHARGE', label: 'Aufladung' },
    { value: 'RECHARGE_ON_ROLL', label: 'Aufladung ab' },
  ] as const;

  const blankAttack = (name: string): MonsterAttack => ({
    name,
    attack_type: 'WEAPON',
    to_hit_mod: 0,
    target_creature_only: false,
    reach: 5,
  });

  function add() {
    items.push({
      name: 'Neue Aktion',
      name_en: '',
      desc: '',
      desc_en: '',
      action_type: 'ACTION',
      legendary_action_cost: 1,
      attacks: [],
    });
    onchange();
  }

  function remove(i: number) {
    items.splice(i, 1);
    onchange();
  }
</script>

<h3 class="section-title">Aktionen</h3>
<div class="ability-list">
  {#each items as action, i}
    <div class="ability-block">
      <div class="ability-hdr">
        <input class="ef ability-name" bind:value={action.name} oninput={onchange} placeholder="Aktion" />
        <select class="ef type-sel" bind:value={action.action_type} onchange={onchange}>
          {#each Object.entries(ACTION_GROUP_LABELS) as [type, label]}
            <option value={type}>{label}</option>
          {/each}
        </select>
        <button class="del-btn" onclick={() => remove(i)}>×</button>
      </div>

      <div class="opt-row">
        {#if action.usage_limits}
          <select class="ef usage-sel" bind:value={action.usage_limits.type} onchange={onchange}>
            {#each USAGE_TYPES as { value, label }}
              <option {value}>{label}</option>
            {/each}
          </select>
          <input class="ef num-sm" type="number" bind:value={action.usage_limits.param} oninput={onchange} />
          <button class="kv-del" onclick={() => { action.usage_limits = undefined; onchange(); }}>×</button>
        {:else}
          <button class="kv-add" onclick={() => { action.usage_limits = { type: 'RECHARGE_ON_ROLL', param: 5 }; onchange(); }}>
            + Aufladung
          </button>
        {/if}
        {#if action.action_type === 'LEGENDARY_ACTION'}
          <span class="lbl-sm">Kosten</span>
          <input class="ef num-sm" type="number" bind:value={action.legendary_action_cost} oninput={onchange} />
        {/if}
      </div>

      <textarea class="ef ability-desc" bind:value={action.desc} oninput={onchange} rows="2"></textarea>

      {#each action.attacks as _, ai}
        <MonsterAttackFields
          attack={action.attacks[ai]}
          {onchange}
          onremove={() => { action.attacks.splice(ai, 1); onchange(); }}
        />
      {/each}
      <button class="kv-add self-start" onclick={() => { action.attacks.push(blankAttack(action.name)); onchange(); }}>
        + Angriff
      </button>
    </div>
  {/each}
  <button class="add-btn" onclick={add}>+ Aktion</button>
</div>

<style>
  .opt-row { display: flex; align-items: center; gap: 0.25rem; flex-wrap: wrap; }

  .lbl-sm {
    font-weight: 700;
    color: var(--mef-accent, var(--danger));
    opacity: 0.7;
    font-size: 0.75rem;
  }

  .num-sm { width: 44px; text-align: center; font-size: 0.82rem; }

  .type-sel, .usage-sel {
    font-size: 0.8rem;
    background: var(--bg-panel);
    cursor: pointer;
    color: var(--ink-soft);
  }

  .self-start { align-self: flex-start; }
</style>
