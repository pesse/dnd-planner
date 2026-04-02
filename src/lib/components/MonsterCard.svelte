<script lang="ts">
  import { activeFile, setFileContent } from '../stores/campaign';
  import { invoke } from '@tauri-apps/api/core';
  import { get } from 'svelte/store';
  import { onMount } from 'svelte';
  import { pushError } from '../stores/errors';
  import type { Monster, MonsterAction } from '../types';
  import MonsterStatBlock from './MonsterStatBlock.svelte';
  import MonsterEditForm from './MonsterEditForm.svelte';

  function parseMonster(json: string): Monster | null {
    try {
      const obj = JSON.parse(json);
      if (!obj || typeof obj !== 'object' || !('stats' in obj) || !('cr' in obj)) return null;
      // Ensure all array/object fields exist so the template never crashes
      obj.traits ??= []; obj.actions ??= []; obj.reactions ??= []; obj.legendary_actions ??= [];
      obj.damage_resistances ??= []; obj.damage_immunities ??= [];
      obj.condition_immunities ??= []; obj.saving_throws ??= {}; obj.skills ??= {};
      obj.ac ??= { value: 10, note: '' }; obj.hp ??= { average: 0, formula: '' };
      obj.stats ??= { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
      return obj as Monster;
    } catch { return null; }
  }

  function mod(score: number): string {
    const m = Math.floor((score - 10) / 2);
    return m >= 0 ? `+${m}` : `${m}`;
  }

  type Tab = 'karte' | 'bearbeiten' | 'json';
  let tab = $state<Tab>('bearbeiten');
  let draft = $state<Monster | null>(null);
  let dirty = $state(false);
  let saveError = $state('');
  let rawJson = $state('');
  let jsonError = $state('');
  let lastSavedContent = $state('');

  function switchTab(t: Tab) {
    if (t === 'json') {
      rawJson = draft ? JSON.stringify(draft, null, 2) : lastSavedContent;
      jsonError = '';
    }
    tab = t;
  }

  onMount(() => {
    async function load(path: string) {
      try {
        const content = await invoke<string>('read_file_content', { path });
        lastSavedContent = content;
        const parsed = parseMonster(content);
        draft = parsed ? structuredClone(parsed) : null;
        dirty = false;
        saveError = '';
        tab = 'bearbeiten';
        setFileContent(content);
      } catch (e) {
        pushError(`Monster konnte nicht geladen werden: ${e instanceof Error ? e.message : e}`);
        draft = null;
        lastSavedContent = '';
      }
    }

    const initial = get(activeFile);
    if (initial?.type === 'monster' && initial.path) load(initial.path);

    const unsub = activeFile.subscribe(file => {
      if (file?.type === 'monster' && file.path) load(file.path);
    });
    return unsub;
  });

  function mark() { dirty = true; }

  async function save() {
    if (!draft || !$activeFile?.path) return;
    try {
      const json = JSON.stringify(draft, null, 2);
      lastSavedContent = json;
      await invoke('write_file_content', { path: $activeFile.path, content: json });
      setFileContent(json);
      dirty = false;
    } catch (e) {
      saveError = `${e}`;
    }
  }

  function discard() {
    const parsed = parseMonster(lastSavedContent);
    draft = parsed ? structuredClone(parsed) : null;
    dirty = false;
    saveError = '';
  }

  async function saveJson() {
    try {
      JSON.parse(rawJson);
      jsonError = '';
      const file = $activeFile;
      if (file?.path) {
        lastSavedContent = rawJson;
        await invoke('write_file_content', { path: file.path, content: rawJson });
        setFileContent(rawJson);
        draft = parseMonster(rawJson);
      }
      tab = 'bearbeiten';
      dirty = false;
    } catch (e) {
      jsonError = `Ungültiges JSON: ${e}`;
    }
  }

  // ── DnD-API-Import ───────────────────────────────────────────────────────────

  const DND_API = 'https://www.dnd5eapi.co/api/2014';

  interface MonsterApiResult { index: string; name: string; url: string; }

  let apiSearch = $state('');
  let apiResults = $state<MonsterApiResult[]>([]);
  let apiSearching = $state(false);
  let apiError = $state('');
  let showApiPanel = $state(false);

  async function apiGet(url: string): Promise<unknown> {
    const text = await invoke<string>('http_request', {
      req: { url, method: 'GET', headers: {}, body: '' },
    });
    return JSON.parse(text);
  }

  async function searchApi() {
    const q = apiSearch.trim();
    if (!q) return;
    apiSearching = true;
    apiError = '';
    apiResults = [];
    try {
      const raw = await apiGet(`${DND_API}/monsters?name=${encodeURIComponent(q)}`);
      apiResults = ((raw as Record<string, unknown>).results as MonsterApiResult[] ?? []).slice(0, 15);
    } catch (e) {
      apiError = `API-Fehler: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      apiSearching = false;
    }
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
      const dmg = (a.damage as Array<{ damage_dice: string; damage_type: { name: string } }> | undefined)?.[0];
      if (dmg) action.damage = `${dmg.damage_dice} ${dmg.damage_type.name}`;
      return action;
    });
  }

  async function importFromApi(result: MonsterApiResult) {
    if (!draft) return;
    try {
      const d = await apiGet(`https://www.dnd5eapi.co${result.url}`) as Record<string, unknown>;
      const profs = (d.proficiencies as ProfEntry[]) ?? [];
      const acArr = (d.armor_class as Array<{ value: number; type: string }> | undefined) ?? [];
      const acNote = acArr.length > 1
        ? acArr.slice(1).map(a => a.type).join(', ')
        : (acArr[0]?.type !== 'dex' ? (acArr[0]?.type ?? '') : '');

      Object.assign(draft, {
        index:               d.index,
        source:              'SRD',
        name:                d.name,
        size:                d.size,
        type:                d.type,
        alignment:           d.alignment,
        ac:                  { value: acArr[0]?.value ?? 10, note: acNote },
        hp:                  { average: d.hit_points as number, formula: (d.hit_dice as string) ?? '' },
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

      dirty = true;
      showApiPanel = false;
      apiSearch = '';
      apiResults = [];
    } catch (e) {
      apiError = `Import fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
</script>

<div class="monster-panel">
  <!-- Tab bar -->
  <div class="tab-bar">
    <button class="tab-btn" class:active={tab === 'karte'} onclick={() => switchTab('karte')}>Karte</button>
    <button class="tab-btn" class:active={tab === 'bearbeiten'} onclick={() => switchTab('bearbeiten')}>Bearbeiten</button>
    <button class="tab-btn" class:active={tab === 'json'} onclick={() => switchTab('json')}>JSON</button>
  </div>

  <!-- Save bar (Bearbeiten + JSON) -->
  {#if dirty && tab !== 'karte'}
    <div class="save-bar">
      {#if saveError}<span class="save-error">{saveError}</span>{/if}
      <button class="save-btn" onclick={tab === 'json' ? saveJson : save}>Speichern</button>
      <button class="cancel-btn" onclick={discard}>Verwerfen</button>
    </div>
  {/if}

  {#if tab === 'karte'}
    {#if draft}
      <MonsterStatBlock monster={draft} />
    {:else}
      <div class="parse-error">Kein gültiger Monster-Datensatz.</div>
    {/if}

  {:else if tab === 'bearbeiten'}
    {#if draft}
    <div class="stat-block">
      <MonsterEditForm bind:monster={draft} onchange={mark} />

      <div class="sb-footer">
        <button class="api-btn" onclick={() => { showApiPanel = !showApiPanel; apiError = ''; }}>DnD-API</button>
      </div>

      {#if showApiPanel}
        <div class="api-panel">
          <div class="api-search-row">
            <input
              class="api-input"
              bind:value={apiSearch}
              onkeydown={(e) => { if (e.key === 'Enter') searchApi(); }}
              placeholder="Englischer Monsternam (z.B. Goblin)"
            />
            <button class="api-search-btn" onclick={searchApi} disabled={apiSearching}>
              {apiSearching ? '…' : 'Suchen'}
            </button>
          </div>
          {#if apiError}<div class="api-error">{apiError}</div>{/if}
          {#if apiResults.length > 0}
            <div class="api-results">
              {#each apiResults as r}
                <button class="api-result-btn" onclick={() => importFromApi(r)}>
                  {r.name} <span class="api-result-index">({r.index})</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>
    {:else}
      <div class="parse-error">Ungültiges Monster-JSON. <button onclick={() => switchTab('json')}>JSON bearbeiten</button></div>
    {/if}

  {:else if tab === 'json'}
    <div class="json-editor">
      {#if jsonError}<div class="json-error-bar">{jsonError}</div>{/if}
      <textarea class="json-textarea" bind:value={rawJson} spellcheck="false"></textarea>
      <div class="json-actions">
        <button class="save-btn" onclick={saveJson}>Speichern</button>
        <button class="cancel-btn" onclick={() => switchTab('bearbeiten')}>Abbrechen</button>
      </div>
    </div>

  {/if}
</div>

<style>
  .monster-panel {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem 1.5rem 1.5rem;
    background: #1e1e2e;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .save-bar {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    background: #2a2a3e;
    border: 1px solid #6b3a3a;
    border-radius: 4px;
    padding: 0.4rem 0.75rem;
    width: 100%;
    max-width: 560px;
  }

  .save-error {
    flex: 1;
    color: #f38ba8;
    font-size: 0.8rem;
  }

  /* ── Stat Block ── */
  .stat-block {
    background: #2a1f35;
    border: 1px solid #6b3a3a;
    border-radius: 6px;
    padding: 1rem 1.25rem;
    max-width: 560px;
    width: 100%;
    font-size: 0.88rem;
    color: #cdd6f4;
  }

  /* ── Footer ── */
  .sb-footer {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.75rem;
    padding-top: 0.5rem;
    border-top: 1px solid #45475a33;
  }

  /* ── Tabs ── */
  .tab-bar {
    display: flex;
    gap: 0;
    width: 100%;
    max-width: 560px;
    border-bottom: 1px solid #313244;
    margin-bottom: 0.25rem;
  }

  .tab-btn {
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: #6c7086;
    cursor: pointer;
    font-size: 0.82rem;
    padding: 0.3rem 0.85rem;
    margin-bottom: -1px;
    transition: color 0.1s, border-color 0.1s;
  }
  .tab-btn:hover { color: #cdd6f4; }
  .tab-btn.active { color: #f38ba8; border-bottom-color: #f38ba8; }

  /* ── JSON Editor ── */
  .json-editor { display: flex; flex-direction: column; width: 100%; max-width: 700px; gap: 0.5rem; }
  .json-error-bar { color: #f38ba8; font-size: 0.8rem; padding: 0.2rem 0; }
  .json-textarea { min-height: 560px; background: #181825; border: 1px solid #313244; border-radius: 4px; color: #cdd6f4; font-family: 'JetBrains Mono', monospace; font-size: 0.82rem; padding: 1rem; outline: none; resize: vertical; line-height: 1.6; }
  .json-actions { display: flex; gap: 0.5rem; }

  .save-btn { background: #a6e3a1; color: #1e1e2e; border: none; border-radius: 4px; padding: 0.25rem 0.75rem; cursor: pointer; font-size: 0.82rem; font-weight: 600; }
  .cancel-btn { background: transparent; border: 1px solid #45475a; color: #6c7086; border-radius: 4px; padding: 0.25rem 0.75rem; cursor: pointer; font-size: 0.82rem; }

  .parse-error { color: #f38ba8; font-size: 0.9rem; }
  .parse-error button { background: none; border: none; color: #89b4fa; cursor: pointer; text-decoration: underline; }

  .api-btn {
    background: transparent;
    border: 1px solid #45475a;
    color: #45475a;
    border-radius: 4px;
    padding: 0.2rem 0.5rem;
    cursor: pointer;
    font-size: 0.75rem;
    margin-right: auto;
  }
  .api-btn:hover { border-color: #89b4fa; color: #89b4fa; }

  .api-panel {
    width: 100%;
    max-width: 560px;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-top: 0.25rem;
  }

  .api-search-row { display: flex; gap: 0.4rem; }

  .api-input {
    flex: 1;
    background: #181825;
    border: 1px solid #313244;
    border-radius: 4px;
    color: #cdd6f4;
    font-size: 0.82rem;
    padding: 0.25rem 0.5rem;
    outline: none;
  }
  .api-input:focus { border-color: #89b4fa; }

  .api-search-btn {
    background: #89b4fa22;
    border: 1px solid #89b4fa;
    color: #89b4fa;
    border-radius: 4px;
    padding: 0.25rem 0.6rem;
    cursor: pointer;
    font-size: 0.82rem;
  }
  .api-search-btn:disabled { opacity: 0.5; cursor: default; }

  .api-error { color: #f38ba8; font-size: 0.78rem; }

  .api-results { display: flex; flex-direction: column; gap: 0.2rem; }

  .api-result-btn {
    background: #1e1e2e;
    border: 1px solid #313244;
    border-radius: 4px;
    color: #cdd6f4;
    font-size: 0.82rem;
    padding: 0.25rem 0.5rem;
    cursor: pointer;
    text-align: left;
  }
  .api-result-btn:hover { border-color: #89b4fa; background: #1a1a2e; }

  .api-result-index { color: #6c7086; font-size: 0.75rem; }
</style>
