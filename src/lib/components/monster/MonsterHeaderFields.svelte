<script lang="ts">
  import type { Monster } from '../../types';
  import { MONSTER_SIZES, MONSTER_TYPES, MONSTER_ALIGNMENTS } from '../../types';
  import './monsterEditForm.css';

  let { monster, onchange }: { monster: Monster; onchange: () => void } = $props();
</script>

<div class="sb-header">
  <input class="ef sb-name" bind:value={monster.name} oninput={onchange} placeholder="Name" />
  <div class="meta-row">
    <select class="ef meta-sel" bind:value={monster.size} onchange={onchange}>
      {#each Object.entries(MONSTER_SIZES) as [key, label]}
        <option value={key}>{label}</option>
      {/each}
    </select>
    <select class="ef meta-sel" bind:value={monster.type} onchange={onchange}>
      {#each Object.entries(MONSTER_TYPES) as [key, label]}
        <option value={key}>{label}</option>
      {/each}
    </select>
    <select class="ef meta-sel" bind:value={monster.alignment} onchange={onchange}>
      {#each Object.entries(MONSTER_ALIGNMENTS) as [key, label]}
        <option value={key}>{label}</option>
      {/each}
    </select>
  </div>
</div>

<div class="divider"></div>

<div class="section">
  <div class="prop">
    <span class="lbl">Rüstungsklasse</span>
    <input class="ef num" type="number" bind:value={monster.ac.value} oninput={onchange} />
    <input class="ef note" bind:value={monster.ac.note} oninput={onchange} placeholder="(z.B. natürliche Rüstung)" />
  </div>
  <div class="prop">
    <span class="lbl">Trefferpunkte</span>
    <input class="ef num" type="number" bind:value={monster.hp.average} oninput={onchange} />
    <input class="ef note" bind:value={monster.hp.formula} oninput={onchange} placeholder="Formel" />
  </div>
  <div class="prop">
    <span class="lbl">Bewegungsrate</span>
    <input class="ef wide" bind:value={monster.speed} oninput={onchange} placeholder="9 m" />
  </div>
</div>

<style>
  .sb-header { margin-bottom: 0.4rem; }

  .sb-name {
    font-size: 1.3rem;
    font-weight: 700;
    color: var(--mef-accent, var(--danger));
    font-variant: small-caps;
    width: 100%;
    margin-bottom: 0.1rem;
  }

  .meta-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.15rem;
    font-style: italic;
    color: var(--ink-soft);
    font-size: 0.85rem;
  }

  .meta-sel {
    font-style: italic;
    color: var(--ink-soft);
    font-size: 0.85rem;
    background: var(--bg-panel);
    cursor: pointer;
    padding: 0.1rem 0.2rem;
    border: 1px solid transparent;
    border-radius: 3px;
  }
  .meta-sel:hover { border-color: var(--border); }
  .meta-sel:focus { border-color: var(--mef-accent, var(--danger)); outline: none; }

  .note { min-width: 80px; color: var(--ink-soft); font-style: italic; }
</style>
