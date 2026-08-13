<script lang="ts">
  import type { Monster } from '../../types';
  import { MONSTER_SIZES, MONSTER_TYPES, MONSTER_ALIGNMENTS } from '../../types';
  import { crLabel, parseCr } from '../../services/monsterFormat';
  import './monsterEditForm.css';

  let { monster, onchange }: { monster: Monster; onchange: () => void } = $props();
</script>

<div class="sb-header">
  <input class="ef sb-name" bind:value={monster.name} oninput={onchange} placeholder="Name" />
  <input class="ef name-en" bind:value={monster.name_en} oninput={onchange} placeholder="Englischer Name" />
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
    <input class="ef num" type="number" bind:value={monster.armor_class} oninput={onchange} />
    <input class="ef note" bind:value={monster.armor_detail} oninput={onchange} placeholder="(z.B. natürliche Rüstung)" />
  </div>
  <div class="prop">
    <span class="lbl">Trefferpunkte</span>
    <input class="ef num" type="number" bind:value={monster.hit_points} oninput={onchange} />
    <input class="ef note" bind:value={monster.hit_dice} oninput={onchange} placeholder="Trefferwürfel, z.B. 2d8 + 2" />
  </div>
  <div class="prop">
    <span class="lbl">HG</span>
    <input class="ef cr" value={crLabel(monster.challenge_rating)}
      onchange={(e) => { monster.challenge_rating = parseCr(e.currentTarget.value); onchange(); }} />
    <span class="sep">(</span>
    <input class="ef num" type="number" bind:value={monster.xp} oninput={onchange} />
    <span class="sep"> EP)</span>
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

  .name-en {
    width: 100%;
    font-size: 0.82rem;
    color: var(--ink-soft);
    font-style: italic;
  }

  .cr { width: 48px; text-align: center; }

  .sep { color: var(--ink-soft); padding: 0 0.1rem; }
</style>
