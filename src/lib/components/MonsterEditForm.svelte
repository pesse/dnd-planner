<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import type { Monster, MonsterAction, MonsterDamage } from '../types';
  import { MONSTER_SIZES, MONSTER_TYPES, MONSTER_ALIGNMENTS } from '../types';
  import { MONSTER_TRANSLATION_SYSTEM_PROMPT } from '../prompts';
  import DndApiSearch from './DndApiSearch.svelte';
  import LlmTranslate from './LlmTranslate.svelte';

  let {
    monster = $bindable<Monster>(),
    onchange = () => void 0,
  }: {
    monster: Monster;
    onchange?: () => void;
  } = $props();

  function mod(score: number): string {
    const m = Math.floor((score - 10) / 2);
    return m >= 0 ? `+${m}` : `${m}`;
  }

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

  function translateDamageType(name: string): string {
    return DAMAGE_TYPE_DE[name.toLowerCase()] ?? name;
  }

  function translateDice(dice: string): string {
    return dice.replace(/d(\d)/g, 'W$1');
  }

  // ── DnD-API-Import ───────────────────────────────────────────────────────────

  const DND_API = 'https://www.dnd5eapi.co/api/2014';

  interface MonsterApiResult { index: string; name: string; url: string; }

  async function apiGet(url: string): Promise<unknown> {
    const text = await invoke<string>('http_request', {
      req: { url, method: 'GET', headers: {}, body: '' },
    });
    return JSON.parse(text);
  }

  async function searchMonsters(q: string): Promise<MonsterApiResult[]> {
    const raw = await apiGet(`${DND_API}/monsters?name=${encodeURIComponent(q)}`);
    return ((raw as Record<string, unknown>).results as MonsterApiResult[] ?? []).slice(0, 15);
  }

  function crFromNumber(n: number): string {
    if (n === 0.125) return '1/8';
    if (n === 0.25)  return '1/4';
    if (n === 0.5)   return '1/2';
    return String(n);
  }

  function ftToM(val: string | number): string {
    const n = typeof val === 'string' ? parseInt(val) : val;
    const m = Math.round(n * 3) / 10;
    return `${m} m`.replace('.', ',');
  }

  function buildSpeed(speed: Record<string, string | number>): string {
    const parts: string[] = [];
    if (speed.walk)   parts.push(ftToM(speed.walk));
    if (speed.fly)    parts.push(`Fliegen ${ftToM(speed.fly)}`);
    if (speed.swim)   parts.push(`Schwimmen ${ftToM(speed.swim)}`);
    if (speed.climb)  parts.push(`Klettern ${ftToM(speed.climb)}`);
    if (speed.burrow) parts.push(`Graben ${ftToM(speed.burrow)}`);
    return parts.join(', ') || '—';
  }

  function buildSenses(senses: Record<string, string | number>): string {
    const NAMES: Record<string, string> = {
      blindsight: 'Blindsicht', darkvision: 'Dunkelsicht',
      tremorsense: 'Erschütterungssinn', truesight: 'Wahre Sicht',
    };
    const parts: string[] = [];
    for (const [k, label] of Object.entries(NAMES)) {
      if (senses[k]) parts.push(`${label} ${ftToM(String(senses[k]).replace(' ft.', ''))}`);
    }
    if (senses.passive_perception) parts.push(`passive Wahrnehmung ${senses.passive_perception}`);
    return parts.join(', ') || '—';
  }

  type ProfEntry = { value: number; proficiency: { index: string; name: string } };

  const SKILL_DE: Record<string, string> = {
    'skill-athletics': 'Athletik', 'skill-acrobatics': 'Akrobatik',
    'skill-sleight-of-hand': 'Fingerfertigkeit', 'skill-stealth': 'Heimlichkeit',
    'skill-arcana': 'Arkanes', 'skill-history': 'Geschichte',
    'skill-investigation': 'Nachforschung', 'skill-nature': 'Naturkunde',
    'skill-religion': 'Religion', 'skill-animal-handling': 'Tierführung',
    'skill-insight': 'Einsicht', 'skill-medicine': 'Medizin',
    'skill-perception': 'Wahrnehmung', 'skill-survival': 'Überlebenskunst',
    'skill-deception': 'Täuschung', 'skill-intimidation': 'Einschüchterung',
    'skill-performance': 'Auftreten', 'skill-persuasion': 'Überredung',
  };

  function extractSavingThrows(profs: ProfEntry[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (const p of profs) {
      const m = p.proficiency.index.match(/^saving-throw-(.+)$/);
      if (m) result[m[1].toUpperCase()] = p.value >= 0 ? `+${p.value}` : `${p.value}`;
    }
    return result;
  }

  function extractSkills(profs: ProfEntry[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (const p of profs) {
      if (!p.proficiency.index.startsWith('skill-')) continue;
      const name = SKILL_DE[p.proficiency.index] ?? p.proficiency.name.replace('Skill: ', '');
      result[name] = p.value >= 0 ? `+${p.value}` : `${p.value}`;
    }
    return result;
  }

  function mapActions(arr: Array<Record<string, unknown>>): MonsterAction[] {
    return arr.map(a => {
      const action: MonsterAction = {
        name: String(a.name ?? ''),
        description: String(a.desc ?? ''),
      };
      if (a.attack_bonus != null) action.attack_bonus = Number(a.attack_bonus);
      const dmgArr = (a.damage as Array<{ damage_dice: string; damage_type: { name: string } }> | undefined) ?? [];
      if (dmgArr.length) action.damage = dmgArr.map(d => ({
        dice: translateDice(d.damage_dice),
        type: translateDamageType(d.damage_type.name),
      }));
      return action;
    });
  }

  async function importFromApi(result: MonsterApiResult) {
    const d = await apiGet(`https://www.dnd5eapi.co${result.url}`) as Record<string, unknown>;
    const profs = (d.proficiencies as ProfEntry[]) ?? [];
    const acArr = (d.armor_class as Array<{ value: number; type: string }> | undefined) ?? [];
    const acNote = acArr.length > 1
      ? acArr.slice(1).map(a => a.type).join(', ')
      : (acArr[0]?.type !== 'dex' ? (acArr[0]?.type ?? '') : '');

    Object.assign(monster, {
      index:               d.index,
      source:              'SRD',
      name:                d.name,
      size:                d.size,
      type:                d.type,
      alignment:           d.alignment,
      ac:                  { value: acArr[0]?.value ?? 10, note: acNote },
      hp:                  { average: d.hit_points as number, formula: (d.hit_points_roll as string) ?? (d.hit_dice as string) ?? '' },
      speed:               buildSpeed((d.speed as Record<string, string | number>) ?? {}),
      stats:               {
        str: d.strength as number, dex: d.dexterity as number,
        con: d.constitution as number, int: d.intelligence as number,
        wis: d.wisdom as number, cha: d.charisma as number,
      },
      saving_throws:       extractSavingThrows(profs),
      skills:              extractSkills(profs),
      damage_resistances:  (d.damage_resistances as string[]) ?? [],
      damage_immunities:   (d.damage_immunities as string[]) ?? [],
      condition_immunities:(d.condition_immunities as Array<{ name: string }> | string[])
                             ?.map(c => typeof c === 'string' ? c : c.name) ?? [],
      senses:              buildSenses((d.senses as Record<string, string | number>) ?? {}),
      languages:           d.languages as string ?? '—',
      cr:                  crFromNumber(d.challenge_rating as number),
      xp:                  d.xp as number ?? 0,
      traits:              mapActions((d.special_abilities as Array<Record<string, unknown>>) ?? []),
      actions:             mapActions((d.actions as Array<Record<string, unknown>>) ?? []),
      reactions:           mapActions((d.reactions as Array<Record<string, unknown>>) ?? []),
      legendary_actions:   mapActions((d.legendary_actions as Array<Record<string, unknown>>) ?? []),
    });
    onchange();
  }

  // ── LLM-Übersetzung ──────────────────────────────────────────────────────────

  function buildTranslationPrompt(): string | null {
    const toTranslate: Record<string, unknown> = {};
    if (monster.name) toTranslate.name = monster.name;
    if (monster.languages) toTranslate.languages = monster.languages;
    if (monster.damage_resistances.length)  toTranslate.damage_resistances  = monster.damage_resistances;
    if (monster.damage_immunities.length)   toTranslate.damage_immunities   = monster.damage_immunities;
    if (monster.condition_immunities.length) toTranslate.condition_immunities = monster.condition_immunities;
    for (const key of ['traits', 'actions', 'reactions', 'legendary_actions'] as const) {
      if (monster[key].length > 0)
        toTranslate[key] = monster[key].map(a => ({ name: a.name, description: a.description }));
    }
    if (Object.keys(toTranslate).length === 0) return null;
    return `Translate these D&D monster fields:\n\n${JSON.stringify(toTranslate, null, 2)}`;
  }

  function applyTranslation(raw: string) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Keine gültige JSON-Antwort vom LLM');
    const translated = JSON.parse(match[0]) as Record<string, unknown>;
    if (typeof translated.name === 'string') monster.name = translated.name;
    if (typeof translated.languages === 'string') monster.languages = translated.languages;
    if (Array.isArray(translated.damage_resistances))
      monster.damage_resistances = translated.damage_resistances as string[];
    if (Array.isArray(translated.damage_immunities))
      monster.damage_immunities = translated.damage_immunities as string[];
    if (Array.isArray(translated.condition_immunities))
      monster.condition_immunities = translated.condition_immunities as string[];
    for (const key of ['traits', 'actions', 'reactions', 'legendary_actions'] as const) {
      const arr = translated[key] as Array<{ name: string; description: string }> | undefined;
      if (!Array.isArray(arr)) continue;
      arr.forEach((t, i) => {
        if (!monster[key][i]) return;
        if (t.name) monster[key][i].name = t.name;
        if (t.description) monster[key][i].description = t.description;
      });
    }
    onchange();
  }

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
      <span class="stat-mod">({mod(monster.stats[STAT_KEYS[i]])})</span>
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

<LlmTranslate
  systemPrompt={MONSTER_TRANSLATION_SYSTEM_PROMPT}
  buildPrompt={buildTranslationPrompt}
  onresult={applyTranslation}
/>

<DndApiSearch
  placeholder="Englischer Monstername (z.B. Goblin)"
  onsearch={searchMonsters}
  onselect={importFromApi}
/>

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
  .ef:hover { border-color: #45475a; background: #1a1a2a; }
  .ef:focus { border-color: var(--mef-accent, #f38ba8); background: #1a1a2a; }

  /* ── Header ── */
  .sb-header { margin-bottom: 0.4rem; }

  .sb-name {
    font-size: 1.3rem;
    font-weight: 700;
    color: var(--mef-accent, #f38ba8);
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
    color: #a6adc8;
    font-size: 0.85rem;
  }

  .meta-sel {
    font-style: italic;
    color: #a6adc8;
    font-size: 0.85rem;
    background: #1a1a2a;
    cursor: pointer;
    padding: 0.1rem 0.2rem;
    border: 1px solid transparent;
    border-radius: 3px;
  }
  .meta-sel:hover { border-color: #45475a; }
  .meta-sel:focus { border-color: var(--mef-accent, #f38ba8); outline: none; }

  .sep { color: #a6adc8; padding: 0 0.1rem; }

  /* ── Divider ── */
  .divider {
    height: 2px;
    background: linear-gradient(to right, #7f3f3f, var(--mef-accent, #f38ba8)55);
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

  .lbl { font-weight: 700; color: var(--mef-accent, #f38ba8); white-space: nowrap; }
  .lbl-sm { font-weight: 700; color: var(--mef-accent, #f38ba8)88; font-size: 0.78rem; white-space: nowrap; }

  .num  { width: 52px; text-align: center; }
  .num-sm { width: 44px; text-align: center; font-size: 0.82rem; }
  .note { min-width: 80px; color: #a6adc8; font-style: italic; }
  .wide { flex: 1; min-width: 120px; }
  .wide-sm { flex: 1; min-width: 80px; font-size: 0.82rem; }
  .dmg-type-sel {
    font-style: normal;
    color: #a6adc8;
    font-size: 0.82rem;
    background: #1a1a2a;
    cursor: pointer;
    padding: 0.1rem 0.2rem;
    border: 1px solid transparent;
    border-radius: 3px;
    width: 80px;
  }
  .dmg-type-sel:hover { border-color: #45475a; }
  .dmg-type-sel:focus { border-color: var(--mef-accent, #f38ba8); outline: none; }
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
    color: var(--mef-accent, #f38ba8);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .stat-in { width: 46px; text-align: center; font-size: 1rem; font-weight: 600; padding: 0.1rem; }
  .stat-mod { font-size: 0.78rem; color: #a6adc8; }

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
  .kv-val { width: 44px; font-size: 0.85rem; color: #a6e3a1; }

  .kv-del {
    background: none; border: none; color: #45475a;
    cursor: pointer; font-size: 0.85rem; padding: 0 0.2rem; line-height: 1;
  }
  .kv-del:hover { color: var(--mef-accent, #f38ba8); }

  .kv-add {
    background: none; border: 1px dashed #45475a; color: #6c7086;
    cursor: pointer; font-size: 0.8rem; padding: 0.05rem 0.35rem; border-radius: 3px;
  }
  .kv-add:hover { border-color: var(--mef-accent, #f38ba8); color: var(--mef-accent, #f38ba8); }

  /* ── Abilities / Actions ── */
  .section-title {
    font-size: 1rem;
    font-weight: 700;
    color: var(--mef-accent, #f38ba8);
    margin: 0 0 0.3rem;
    font-variant: small-caps;
    border-bottom: 1px solid var(--mef-accent, #f38ba8);
    padding-bottom: 0.15rem;
  }

  .ability-list { display: flex; flex-direction: column; gap: 0.4rem; }

  .ability-block {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    border-left: 2px solid var(--mef-dim, var(--mef-accent, #f38ba8)44);
    padding-left: 0.5rem;
  }

  .ability-hdr { display: flex; align-items: center; gap: 0.25rem; }

  .ability-name {
    font-weight: 700;
    font-style: italic;
    color: #cdd6f4;
    flex: 1;
    min-width: 0;
  }

  .attack-row { display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; }

  .ability-desc {
    width: 100%;
    resize: vertical;
    line-height: 1.5;
    font-size: 0.85rem;
    color: #cdd6f4;
    min-height: 2.5rem;
  }

  .del-btn {
    background: none; border: none; color: #45475a;
    cursor: pointer; font-size: 1rem; padding: 0 0.2rem; flex-shrink: 0;
  }
  .del-btn:hover { color: var(--mef-accent, #f38ba8); }

  .add-btn {
    background: none; border: 1px dashed #45475a; color: #6c7086;
    cursor: pointer; font-size: 0.8rem; padding: 0.15rem 0.5rem;
    border-radius: 3px; align-self: flex-start;
  }
  .add-btn:hover { border-color: var(--mef-accent, #f38ba8); color: var(--mef-accent, #f38ba8); }
</style>
