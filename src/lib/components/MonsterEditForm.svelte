<script lang="ts">
  import type { Monster, MonsterAction } from '../types';
  import { MONSTER_SIZES, MONSTER_TYPES, MONSTER_ALIGNMENTS } from '../types';
  import { modStr } from '../domain/skills';

  let {
    monster = $bindable<Monster>(),
    onchange = () => void 0,
  }: {
    monster: Monster;
    onchange?: () => void;
  } = $props();

  const STAT_LABELS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;
  type StatKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  const STAT_KEYS: StatKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

  // ── Schadens-Lookup ──────────────────────────────────────────────────────────

  const DAMAGE_TYPE_DE: Record<string, string> = {
    acid: 'Säure', bludgeoning: 'Wucht', cold: 'Kälte', fire: 'Feuer',
    force: 'Energie', lightning: 'Blitz', necrotic: 'Nekrose', piercing: 'Stich',
    poison: 'Gift', psychic: 'Psyche', radiant: 'Strahlung', slashing: 'Hieb',
    thunder: 'Donner',
  };


  // ─────────────────────────────────────────────────────────────────────────────

  function addAction(arr: MonsterAction[]) { arr.push({ name: 'Neue Aktion', description: '' }); onchange(); }
  function removeAction(arr: MonsterAction[], i: number) { arr.splice(i, 1); onchange(); }

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

<!-- Header -->
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

<!-- AC / HP / Speed -->
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

<div class="divider"></div>

<!-- Ability scores -->
<div class="stats-grid">
  {#each STAT_LABELS as label, i}
    <div class="stat-cell">
      <span class="stat-lbl">{label}</span>
      <input class="ef stat-in" type="number" bind:value={monster.stats[STAT_KEYS[i]]} oninput={onchange} />
      <span class="stat-mod">({modStr(monster.stats[STAT_KEYS[i]])})</span>
    </div>
  {/each}
</div>

<div class="divider"></div>

<!-- Saving throws / Skills / Immunities etc. -->
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

<!-- Traits -->
{#if monster.traits.length || true}
  <div class="divider"></div>
  <div class="ability-list">
    {#each monster.traits as trait, i}
      <div class="ability-block">
        <div class="ability-hdr">
          <input class="ef ability-name" bind:value={trait.name} oninput={onchange} placeholder="Eigenschaft" />
          <button class="del-btn" onclick={() => removeAction(monster.traits, i)}>×</button>
        </div>
        <textarea class="ef ability-desc" bind:value={trait.description} oninput={onchange} rows="2"></textarea>
      </div>
    {/each}
    <button class="add-btn" onclick={() => addAction(monster.traits)}>+ Eigenschaft</button>
  </div>
{/if}

<!-- Actions -->
<div class="divider"></div>
<h3 class="section-title">Aktionen</h3>
<div class="ability-list">
  {#each monster.actions as action, i}
    <div class="ability-block">
      <div class="ability-hdr">
        <input class="ef ability-name" bind:value={action.name} oninput={onchange} placeholder="Aktion" />
        <button class="del-btn" onclick={() => removeAction(monster.actions, i)}>×</button>
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
  <button class="add-btn" onclick={() => addAction(monster.actions)}>+ Aktion</button>
</div>

<!-- Reactions -->
{#if monster.reactions.length || true}
  <div class="divider"></div>
  <h3 class="section-title">Reaktionen</h3>
  <div class="ability-list">
    {#each monster.reactions as reaction, i}
      <div class="ability-block">
        <div class="ability-hdr">
          <input class="ef ability-name" bind:value={reaction.name} oninput={onchange} placeholder="Reaktion" />
          <button class="del-btn" onclick={() => removeAction(monster.reactions, i)}>×</button>
        </div>
        <textarea class="ef ability-desc" bind:value={reaction.description} oninput={onchange} rows="2"></textarea>
      </div>
    {/each}
    <button class="add-btn" onclick={() => addAction(monster.reactions)}>+ Reaktion</button>
  </div>
{/if}

<!-- Legendary actions -->
{#if monster.legendary_actions.length || true}
  <div class="divider"></div>
  <h3 class="section-title">Legendäre Aktionen</h3>
  <div class="ability-list">
    {#each monster.legendary_actions as la, i}
      <div class="ability-block">
        <div class="ability-hdr">
          <input class="ef ability-name" bind:value={la.name} oninput={onchange} placeholder="Legendäre Aktion" />
          <button class="del-btn" onclick={() => removeAction(monster.legendary_actions, i)}>×</button>
        </div>
        <textarea class="ef ability-desc" bind:value={la.description} oninput={onchange} rows="2"></textarea>
      </div>
    {/each}
    <button class="add-btn" onclick={() => addAction(monster.legendary_actions)}>+ Legendäre Aktion</button>
  </div>
{/if}

<style>
  /* ── Editable field base ── */
  .ef {
    background: transparent;
    border: 1px solid transparent;
    color: inherit;
    font: inherit;
    padding: 0.1rem 0.25rem;
    border-radius: 3px;
    outline: none;
    transition: border-color 0.1s, background 0.1s;
  }
  .ef:hover { border-color: var(--border); background: var(--bg-panel); }
  .ef:focus { border-color: var(--mef-accent, var(--danger)); background: var(--bg-panel); }

  /* ── Header ── */
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

  .sep { color: var(--ink-soft); padding: 0 0.1rem; }

  /* ── Divider ── */
  .divider {
    height: 2px;
    background: linear-gradient(to right, var(--red), color-mix(in srgb, var(--mef-accent, var(--danger)) 33%, transparent));
    margin: 0.6rem 0;
    border-radius: 1px;
  }

  /* ── Section / prop rows ── */
  .section { display: flex; flex-direction: column; gap: 0.15rem; }

  .prop {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.2rem;
    line-height: 1.8;
  }

  .lbl { font-weight: 700; color: var(--mef-accent, var(--danger)); white-space: nowrap; }
  .lbl-sm { font-weight: 700; color: var(--mef-accent, var(--danger)); opacity: 0.7; font-size: 0.78rem; white-space: nowrap; }

  .num  { width: 52px; text-align: center; }
  .num-sm { width: 44px; text-align: center; font-size: 0.82rem; }
  .note { min-width: 80px; color: var(--ink-soft); font-style: italic; }
  .wide { flex: 1; min-width: 120px; }
  .wide-sm { flex: 1; min-width: 80px; font-size: 0.82rem; }
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
  .cr   { width: 40px; text-align: center; }

  /* ── Ability scores ── */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    text-align: center;
    gap: 0.25rem;
  }

  .stat-cell { display: flex; flex-direction: column; align-items: center; gap: 0.05rem; }

  .stat-lbl {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--mef-accent, var(--danger));
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .stat-in { width: 46px; text-align: center; font-size: 1rem; font-weight: 600; padding: 0.1rem; }
  .stat-mod { font-size: 0.78rem; color: var(--ink-soft); }

  /* ── KV pairs ── */
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

  .kv-del {
    background: none; border: none; color: var(--border);
    cursor: pointer; font-size: 0.85rem; padding: 0 0.2rem; line-height: 1;
  }
  .kv-del:hover { color: var(--mef-accent, var(--danger)); }

  .kv-add {
    background: none; border: 1px dashed var(--border); color: var(--ink-muted);
    cursor: pointer; font-size: 0.8rem; padding: 0.05rem 0.35rem; border-radius: 3px;
  }
  .kv-add:hover { border-color: var(--mef-accent, var(--danger)); color: var(--mef-accent, var(--danger)); }

  /* ── Abilities / Actions ── */
  .section-title {
    font-size: 1rem;
    font-weight: 700;
    color: var(--mef-accent, var(--danger));
    margin: 0 0 0.3rem;
    font-variant: small-caps;
    border-bottom: 1px solid var(--mef-accent, var(--danger));
    padding-bottom: 0.15rem;
  }

  .ability-list { display: flex; flex-direction: column; gap: 0.4rem; }

  .ability-block {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    border-left: 2px solid var(--mef-dim, color-mix(in srgb, var(--mef-accent, var(--danger)) 27%, transparent));
    padding-left: 0.5rem;
  }

  .ability-hdr { display: flex; align-items: center; gap: 0.25rem; }

  .ability-name {
    font-weight: 700;
    font-style: italic;
    color: var(--ink);
    flex: 1;
    min-width: 0;
  }

  .attack-row { display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; }

  .ability-desc {
    width: 100%;
    resize: vertical;
    line-height: 1.5;
    font-size: 0.85rem;
    color: var(--ink);
    min-height: 2.5rem;
  }

  .del-btn {
    background: none; border: none; color: var(--border);
    cursor: pointer; font-size: 1rem; padding: 0 0.2rem; flex-shrink: 0;
  }
  .del-btn:hover { color: var(--mef-accent, var(--danger)); }

  .add-btn {
    background: none; border: 1px dashed var(--border); color: var(--ink-muted);
    cursor: pointer; font-size: 0.8rem; padding: 0.15rem 0.5rem;
    border-radius: 3px; align-self: flex-start;
  }
  .add-btn:hover { border-color: var(--mef-accent, var(--danger)); color: var(--mef-accent, var(--danger)); }
</style>
