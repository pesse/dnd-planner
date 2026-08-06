<script lang="ts">
  import type { Monster } from '../../types';
  import './monsterEditForm.css';

  let { monster, onchange }: { monster: Monster; onchange: () => void } = $props();

  function kvKeys(obj: Record<string, string>): string[] { return Object.keys(obj); }
  function addKv(obj: Record<string, string>) { obj[`neu_${Date.now()}`] = ''; onchange(); }
  function removeKv(obj: Record<string, string>, key: string) { delete obj[key]; onchange(); }
  function renameKv(obj: Record<string, string>, oldKey: string, newKey: string) {
    if (oldKey === newKey || newKey in obj) return;
    const val = obj[oldKey];
    const keys = Object.keys(obj);
    const idx = keys.indexOf(oldKey);
    const entries = keys.map(k => [k, obj[k]] as [string, string]);
    entries[idx] = [newKey, val];
    for (const k of Object.keys(obj)) delete obj[k];
    for (const [k, v] of entries) obj[k] = v;
    onchange();
  }
</script>

<div class="section">
  <div class="kv-row">
    <span class="lbl">Rettungswürfe</span>
    <div class="kv-list">
      {#each kvKeys(monster.saving_throws) as key}
        <span class="kv-pair">
          <input class="ef kv-key" value={key} onblur={(e) => renameKv(monster.saving_throws, key, e.currentTarget.value)} />
          <input class="ef kv-val" bind:value={monster.saving_throws[key]} oninput={onchange} />
          <button class="kv-del" onclick={() => removeKv(monster.saving_throws, key)}>×</button>
        </span>
      {/each}
      <button class="kv-add" onclick={() => addKv(monster.saving_throws)}>+</button>
    </div>
  </div>
  <div class="kv-row">
    <span class="lbl">Fertigkeiten</span>
    <div class="kv-list">
      {#each kvKeys(monster.skills) as key}
        <span class="kv-pair">
          <input class="ef kv-key" value={key} onblur={(e) => renameKv(monster.skills, key, e.currentTarget.value)} />
          <input class="ef kv-val" bind:value={monster.skills[key]} oninput={onchange} />
          <button class="kv-del" onclick={() => removeKv(monster.skills, key)}>×</button>
        </span>
      {/each}
      <button class="kv-add" onclick={() => addKv(monster.skills)}>+</button>
    </div>
  </div>
  <div class="prop">
    <span class="lbl">Resistenzen</span>
    <input class="ef wide" value={monster.damage_resistances.join(', ')}
      oninput={(e) => { monster.damage_resistances = e.currentTarget.value.split(',').map(s => s.trim()).filter(Boolean); onchange(); }} />
  </div>
  <div class="prop">
    <span class="lbl">Schadensimmunitäten</span>
    <input class="ef wide" value={monster.damage_immunities.join(', ')}
      oninput={(e) => { monster.damage_immunities = e.currentTarget.value.split(',').map(s => s.trim()).filter(Boolean); onchange(); }} />
  </div>
  <div class="prop">
    <span class="lbl">Zustandsimmunitäten</span>
    <input class="ef wide" value={monster.condition_immunities.join(', ')}
      oninput={(e) => { monster.condition_immunities = e.currentTarget.value.split(',').map(s => s.trim()).filter(Boolean); onchange(); }} />
  </div>
  <div class="prop">
    <span class="lbl">Sinne</span>
    <input class="ef wide" bind:value={monster.senses} oninput={onchange} />
  </div>
  <div class="prop">
    <span class="lbl">Sprachen</span>
    <input class="ef wide" bind:value={monster.languages} oninput={onchange} />
  </div>
  <div class="prop">
    <span class="lbl">HG</span>
    <input class="ef cr" bind:value={monster.cr} oninput={onchange} />
    <span class="sep">(</span>
    <input class="ef num" type="number" bind:value={monster.xp} oninput={onchange} />
    <span class="sep"> EP)</span>
  </div>
</div>

<style>
  .kv-row {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    flex-wrap: wrap;
    line-height: 1.8;
  }

  .kv-list { display: flex; flex-wrap: wrap; gap: 0.2rem; align-items: center; }

  .kv-pair { display: flex; align-items: center; gap: 0.1rem; }

  .kv-key { width: 80px; font-size: 0.85rem; }
  .kv-val { width: 44px; font-size: 0.85rem; color: var(--green); }

  .cr { width: 40px; text-align: center; }

  .sep { color: var(--ink-soft); padding: 0 0.1rem; }
</style>
