<script lang="ts">
  import type { MonsterAction } from '../../types';
  import './monsterEditForm.css';

  let {
    items = $bindable<MonsterAction[]>(),
    onchange,
  }: {
    items: MonsterAction[];
    onchange: () => void;
  } = $props();

  const DAMAGE_TYPE_DE: Record<string, string> = {
    acid: 'Säure', bludgeoning: 'Wucht', cold: 'Kälte', fire: 'Feuer',
    force: 'Energie', lightning: 'Blitz', necrotic: 'Nekrose', piercing: 'Stich',
    poison: 'Gift', psychic: 'Psyche', radiant: 'Strahlung', slashing: 'Hieb',
    thunder: 'Donner',
  };

  function add() { items.push({ name: 'Neue Aktion', description: '' }); onchange(); }
  function remove(i: number) { items.splice(i, 1); onchange(); }
</script>

<h3 class="section-title">Aktionen</h3>
<div class="ability-list">
  {#each items as action, i}
    <div class="ability-block">
      <div class="ability-hdr">
        <input class="ef ability-name" bind:value={action.name} oninput={onchange} placeholder="Aktion" />
        <button class="del-btn" onclick={() => remove(i)}>×</button>
      </div>
      <div class="attack-row">
        <span class="lbl-sm">Angriffsbonus</span>
        <input class="ef num-sm" type="number"
          value={action.attack_bonus ?? ''}
          oninput={(e) => { action.attack_bonus = e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value); onchange(); }} />
        {#each (action.damage ?? [{ dice: '', type: '' }]) as dmg, di}
          <input class="ef num-sm" value={dmg.dice}
            oninput={(e) => { if (!action.damage) action.damage = [{ dice: '', type: '' }]; action.damage[di].dice = e.currentTarget.value; onchange(); }}
            placeholder="2W6+3" />
          <select class="ef dmg-type-sel" value={dmg.type}
            onchange={(e) => { if (!action.damage) action.damage = [{ dice: '', type: '' }]; action.damage[di].type = e.currentTarget.value; onchange(); }}>
            <option value="">—</option>
            {#each Object.values(DAMAGE_TYPE_DE) as label}
              <option value={label}>{label}</option>
            {/each}
          </select>
        {/each}
        <button class="kv-add" onclick={() => { action.damage = [...(action.damage ?? []), { dice: '', type: '' }]; onchange(); }}>+</button>
        {#if action.damage && action.damage.length > 1}
          <button class="kv-del" onclick={() => { action.damage = action.damage!.slice(0, -1); onchange(); }}>×</button>
        {/if}
      </div>
      <textarea class="ef ability-desc" bind:value={action.description} oninput={onchange} rows="2"></textarea>
    </div>
  {/each}
  <button class="add-btn" onclick={add}>+ Aktion</button>
</div>

<style>
  .attack-row { display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; }

  .lbl-sm { font-weight: 700; color: var(--mef-accent, var(--danger)); opacity: 0.7; font-size: 0.78rem; white-space: nowrap; }

  .num-sm { width: 44px; text-align: center; font-size: 0.82rem; }

  .dmg-type-sel {
    font-style: normal;
    color: var(--ink-soft);
    font-size: 0.82rem;
    background: var(--bg-panel);
    cursor: pointer;
    padding: 0.1rem 0.2rem;
    border: 1px solid transparent;
    border-radius: 3px;
    width: 80px;
  }
  .dmg-type-sel:hover { border-color: var(--border); }
  .dmg-type-sel:focus { border-color: var(--mef-accent, var(--danger)); outline: none; }
</style>
