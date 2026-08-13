<script lang="ts">
  import type { MonsterAttack, MonsterDamageRoll } from '../../types';
  import { DAMAGE_DICE, DAMAGE_TYPES } from '../../schemas/vocabulary';
  import { DAMAGE_TYPE_LABELS } from '../../itemLabels';
  import './monsterEditForm.css';

  let {
    attack,
    onchange,
    onremove,
  }: {
    attack: MonsterAttack;
    onchange: () => void;
    onremove: () => void;
  } = $props();

  const blankRoll = (): MonsterDamageRoll => ({ die_count: 1, die_type: 'D6', bonus: 0 });
</script>

<div class="atk">
  <div class="atk-row">
    <input class="ef atk-name" bind:value={attack.name} oninput={onchange} placeholder="Angriff" />
    <span class="lbl-sm">Bonus</span>
    <input class="ef num-sm" type="number" bind:value={attack.to_hit_mod} oninput={onchange} />
    <span class="lbl-sm">Reichweite</span>
    <input class="ef num-sm" type="number" step="5"
      value={attack.reach ?? ''}
      oninput={(e) => { attack.reach = e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value); onchange(); }}
      placeholder="ft" />
    <span class="lbl-sm">Distanz</span>
    <input class="ef num-sm" type="number" step="5"
      value={attack.range ?? ''}
      oninput={(e) => { attack.range = e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value); onchange(); }}
      placeholder="ft" />
    <input class="ef num-sm" type="number" step="5"
      value={attack.long_range ?? ''}
      oninput={(e) => { attack.long_range = e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value); onchange(); }}
      placeholder="max" />
    <button class="kv-del" onclick={onremove}>×</button>
  </div>

  {#each [{ key: 'damage', label: 'Schaden' }, { key: 'extra_damage', label: 'Zusatz' }] as const as { key, label }}
    <div class="atk-row">
      <span class="lbl-sm">{label}</span>
      {#if attack[key]}
        <input class="ef num-sm" type="number" bind:value={attack[key]!.die_count} oninput={onchange} />
        <select class="ef sel-sm" bind:value={attack[key]!.die_type} onchange={onchange}>
          {#each DAMAGE_DICE as die}
            <option value={die}>W{die.slice(1)}</option>
          {/each}
        </select>
        <span class="lbl-sm">+</span>
        <input class="ef num-sm" type="number" bind:value={attack[key]!.bonus} oninput={onchange} />
        <select class="ef sel-sm wide-sel" bind:value={attack[key]!.type} onchange={onchange}>
          <option value={undefined}>—</option>
          {#each DAMAGE_TYPES as type}
            <option value={type}>{DAMAGE_TYPE_LABELS[type]}</option>
          {/each}
        </select>
        <button class="kv-del" onclick={() => { attack[key] = undefined; onchange(); }}>×</button>
      {:else}
        <button class="kv-add" onclick={() => { attack[key] = blankRoll(); onchange(); }}>+</button>
      {/if}
    </div>
  {/each}
</div>

<style>
  .atk {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.15rem 0 0.15rem 0.4rem;
    border-left: 1px dashed var(--border);
  }

  .atk-row { display: flex; align-items: center; gap: 0.25rem; flex-wrap: wrap; }

  .atk-name { font-size: 0.85rem; min-width: 90px; flex: 1; }

  .lbl-sm {
    font-weight: 700;
    color: var(--mef-accent, var(--danger));
    opacity: 0.7;
    font-size: 0.75rem;
    white-space: nowrap;
  }

  .num-sm { width: 44px; text-align: center; font-size: 0.82rem; }

  .sel-sm {
    font-size: 0.82rem;
    background: var(--bg-panel);
    cursor: pointer;
    width: 3.4rem;
  }
  .wide-sel { width: 6rem; }
</style>
