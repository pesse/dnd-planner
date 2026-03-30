<script lang="ts">
  import { activeFile, fileContent, setFileContent } from '../stores/campaign';
  import { invoke } from '@tauri-apps/api/core';
  import { get } from 'svelte/store';
  import { onMount } from 'svelte';
  import { pushError } from '../stores/errors';

  interface NpcStats {
    str: number; dex: number; con: number;
    int: number; wis: number; cha: number;
  }

  interface NpcData {
    name: string;
    role: string;
    status: 'lebendig' | 'tot' | 'vermisst' | 'unbekannt';
    appearance: string;
    personality: string;
    motivation: string;
    secret: string;
    notes: string;
    ac: number;
    hp: string;
    speed: string;
    stats: NpcStats;
    skills: Record<string, string>;
    spells: string[];
    inventory: string[];
    tags: string[];
  }

  function parseNpc(json: string): NpcData | null {
    try {
      const obj = JSON.parse(json);
      if (!obj || typeof obj !== 'object') return null;
      obj.name        ??= '';
      obj.role        ??= '';
      obj.status      ??= 'lebendig';
      obj.appearance  ??= '';
      obj.personality ??= '';
      obj.motivation  ??= '';
      obj.secret      ??= '';
      obj.notes       ??= '';
      obj.ac          ??= 10;
      obj.hp          ??= '';
      obj.speed       ??= '';
      obj.stats       ??= { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
      obj.skills      ??= {};
      obj.spells      ??= [];
      obj.inventory   ??= [];
      obj.tags        ??= [];
      return obj as NpcData;
    } catch { return null; }
  }

  function mod(score: number): string {
    const m = Math.floor((score - 10) / 2);
    return m >= 0 ? `+${m}` : `${m}`;
  }

  const STAT_LABELS: (keyof NpcStats)[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  const STAT_NAMES: Record<keyof NpcStats, string> = {
    str: 'STR', dex: 'GES', con: 'KON', int: 'INT', wis: 'WEI', cha: 'CHA',
  };

  let draft = $state<NpcData | null>(null);
  let dirty = $state(false);
  let saveError = $state('');
  let showJson = $state(false);
  let rawJson = $state('');
  let jsonError = $state('');

  // Skill / Spell / Inventory editing
  let newSkillKey = $state('');
  let newSkillVal = $state('');
  let newSpell = $state('');
  let newItem = $state('');

  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  onMount(() => {
    async function load(path: string) {
      try {
        const content = await invoke<string>('read_file_content', { path });
        const parsed = parseNpc(content);
        draft = parsed ? structuredClone(parsed) : null;
        dirty = false;
        saveError = '';
        setFileContent(content);
      } catch (e) {
        pushError(`NPC konnte nicht geladen werden: ${e instanceof Error ? e.message : e}`);
        draft = null;
      }
    }

    const initial = get(activeFile);
    if (initial?.type === 'npc' && initial.path) load(initial.path);

    const unsub = activeFile.subscribe((file) => {
      if (file?.type === 'npc' && file.path) load(file.path);
    });

    const unsubContent = fileContent.subscribe((content) => {
      const file = get(activeFile);
      if (!content || file?.type !== 'npc') return;
      const parsed = parseNpc(content);
      if (parsed) { draft = structuredClone(parsed); dirty = false; }
    });

    return () => { unsub(); unsubContent(); };
  });

  function scheduleSave() {
    dirty = true;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 600);
  }

  async function save() {
    const file = get(activeFile);
    if (!file?.path || !draft) return;
    try {
      const content = JSON.stringify(draft, null, 2);
      await invoke('write_file_content', { path: file.path, content });
      setFileContent(content);
      dirty = false;
      saveError = '';
    } catch (e) { saveError = String(e); }
  }

  function openJson() {
    if (!draft) return;
    rawJson = JSON.stringify(draft, null, 2);
    jsonError = '';
    showJson = true;
  }

  function applyJson() {
    const parsed = parseNpc(rawJson);
    if (!parsed) { jsonError = 'Ungültiges JSON'; return; }
    draft = parsed;
    showJson = false;
    scheduleSave();
  }

  function addSkill() {
    if (!draft || !newSkillKey.trim()) return;
    draft.skills[newSkillKey.trim()] = newSkillVal.trim();
    newSkillKey = ''; newSkillVal = '';
    scheduleSave();
  }
  function removeSkill(key: string) {
    if (!draft) return;
    delete draft.skills[key];
    draft = draft; // trigger reactivity
    scheduleSave();
  }

  function addSpell() {
    if (!draft || !newSpell.trim()) return;
    draft.spells = [...draft.spells, newSpell.trim()];
    newSpell = '';
    scheduleSave();
  }
  function removeSpell(i: number) {
    if (!draft) return;
    draft.spells = draft.spells.filter((_, idx) => idx !== i);
    scheduleSave();
  }

  function addItem() {
    if (!draft || !newItem.trim()) return;
    draft.inventory = [...draft.inventory, newItem.trim()];
    newItem = '';
    scheduleSave();
  }
  function removeItem(i: number) {
    if (!draft) return;
    draft.inventory = draft.inventory.filter((_, idx) => idx !== i);
    scheduleSave();
  }

  function tagsString(tags: string[]): string { return tags.join(', '); }
  function parseTags(s: string): string[] {
    return s.split(',').map((t) => t.trim()).filter(Boolean);
  }

  const STATUS_LABELS: Record<NpcData['status'], string> = {
    lebendig: 'Lebendig', tot: 'Tot', vermisst: 'Vermisst', unbekannt: 'Unbekannt',
  };
</script>

{#if !draft}
  <div class="npc-empty">NPC konnte nicht geladen werden.</div>
{:else if showJson}
  <div class="npc-json-view">
    <div class="json-toolbar">
      <span class="json-label">JSON</span>
      {#if jsonError}<span class="json-error">{jsonError}</span>{/if}
      <div style="flex:1"></div>
      <button onclick={applyJson}>Übernehmen</button>
      <button onclick={() => { showJson = false; }}>Abbrechen</button>
    </div>
    <textarea class="json-ta" bind:value={rawJson} spellcheck="false"></textarea>
  </div>
{:else}
  <div class="npc-card">

    <!-- Header -->
    <div class="npc-header">
      <input class="npc-name" bind:value={draft.name} oninput={scheduleSave} placeholder="Name" />
      <select class="npc-status status-{draft.status}" bind:value={draft.status} onchange={scheduleSave}>
        {#each Object.entries(STATUS_LABELS) as [val, label]}
          <option value={val}>{label}</option>
        {/each}
      </select>
    </div>
    <input class="npc-role" bind:value={draft.role} oninput={scheduleSave} placeholder="Rolle (z.B. Händler, Informant)" />

    <!-- Narrative -->
    <div class="section-label">Beschreibung</div>
    <div class="npc-fields">
      {#each [
        { key: 'appearance',  label: 'Aussehen' },
        { key: 'personality', label: 'Persönlichkeit' },
        { key: 'motivation',  label: 'Motivation' },
      ] as field}
        <div class="npc-field">
          <label>{field.label}</label>
          <textarea
            value={draft[field.key as keyof NpcData] as string}
            oninput={(e) => {
              (draft as Record<string, unknown>)[field.key] = (e.currentTarget as HTMLTextAreaElement).value;
              scheduleSave();
            }}
            rows="2"
            placeholder="—"
          ></textarea>
        </div>
      {/each}
      <div class="npc-field secret-field">
        <label>🔒 Geheimnis</label>
        <textarea bind:value={draft.secret} oninput={scheduleSave} rows="2" placeholder="—"></textarea>
      </div>
      <div class="npc-field">
        <label>Notizen</label>
        <textarea bind:value={draft.notes} oninput={scheduleSave} rows="2" placeholder="—"></textarea>
      </div>
    </div>

    <!-- Spielwerte -->
    <div class="section-label">Spielwerte</div>
    <div class="combat-row">
      <div class="combat-field">
        <label>RK</label>
        <input type="number" bind:value={draft.ac} oninput={scheduleSave} />
      </div>
      <div class="combat-field">
        <label>TP</label>
        <input bind:value={draft.hp} oninput={scheduleSave} placeholder="z.B. 27 (5W8+5)" />
      </div>
      <div class="combat-field">
        <label>Tempo</label>
        <input bind:value={draft.speed} oninput={scheduleSave} placeholder="z.B. 9m" />
      </div>
    </div>

    <div class="stats-grid">
      {#each STAT_LABELS as attr}
        <div class="stat-box">
          <span class="stat-label">{STAT_NAMES[attr]}</span>
          <input
            class="stat-input"
            type="number"
            bind:value={draft.stats[attr]}
            oninput={scheduleSave}
          />
          <span class="stat-mod">{mod(draft.stats[attr])}</span>
        </div>
      {/each}
    </div>

    <!-- Fertigkeiten -->
    <div class="section-label">Fertigkeiten</div>
    <div class="tag-list">
      {#each Object.entries(draft.skills) as [key, val]}
        <span class="tag-item">
          {key}: {val}
          <button class="tag-remove" onclick={() => removeSkill(key)}>×</button>
        </span>
      {/each}
    </div>
    <div class="add-row">
      <input class="add-input" bind:value={newSkillKey} placeholder="Fertigkeit" onkeydown={(e) => e.key === 'Enter' && addSkill()} />
      <input class="add-input add-val" bind:value={newSkillVal} placeholder="+4" onkeydown={(e) => e.key === 'Enter' && addSkill()} />
      <button class="add-btn" onclick={addSkill}>+</button>
    </div>

    <!-- Zauber -->
    <div class="section-label">Zauber</div>
    <div class="tag-list">
      {#each draft.spells as spell, i}
        <span class="tag-item spell-tag">
          {spell}
          <button class="tag-remove" onclick={() => removeSpell(i)}>×</button>
        </span>
      {/each}
    </div>
    <div class="add-row">
      <input class="add-input" bind:value={newSpell} placeholder="Zaubername oder Slug" onkeydown={(e) => e.key === 'Enter' && addSpell()} />
      <button class="add-btn" onclick={addSpell}>+</button>
    </div>

    <!-- Inventar -->
    <div class="section-label">Inventar</div>
    <div class="tag-list">
      {#each draft.inventory as item, i}
        <span class="tag-item inv-tag">
          {item}
          <button class="tag-remove" onclick={() => removeItem(i)}>×</button>
        </span>
      {/each}
    </div>
    <div class="add-row">
      <input class="add-input" bind:value={newItem} placeholder="Gegenstand" onkeydown={(e) => e.key === 'Enter' && addItem()} />
      <button class="add-btn" onclick={addItem}>+</button>
    </div>

    <!-- Tags & Footer -->
    <div class="npc-field npc-tags-field" style="margin-top:0.5rem">
      <label>Tags</label>
      <input
        class="tags-input"
        value={tagsString(draft.tags)}
        oninput={(e) => { draft!.tags = parseTags((e.currentTarget as HTMLInputElement).value); scheduleSave(); }}
        placeholder="kommagetrennt"
      />
    </div>

    <div class="npc-footer">
      {#if saveError}<span class="save-error">{saveError}</span>{/if}
      <span class="save-status">{dirty ? '●' : ''}</span>
      <button class="json-btn" onclick={openJson}>JSON</button>
    </div>

  </div>
{/if}

<style>
  .npc-empty { padding: 2rem; color: #6c7086; }

  .npc-card {
    flex: 1;
    overflow-y: auto;
    padding: 1.25rem 2rem 2rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    color: #cdd6f4;
  }

  /* Header */
  .npc-header { display: flex; align-items: center; gap: 0.75rem; }

  .npc-name {
    flex: 1;
    background: none;
    border: none;
    border-bottom: 1px solid #313244;
    color: #cba6f7;
    font-size: 1.6rem;
    font-weight: 700;
    padding: 0.1rem 0;
    outline: none;
    font-family: inherit;
  }
  .npc-name:focus { border-bottom-color: #89b4fa; }

  .npc-status {
    background: #313244;
    border: 1px solid #45475a;
    border-radius: 99px;
    color: #cdd6f4;
    font-size: 0.75rem;
    padding: 0.2rem 0.6rem;
    cursor: pointer;
    outline: none;
    font-family: inherit;
    flex-shrink: 0;
  }
  .npc-status.status-lebendig { color: #a6e3a1; border-color: #a6e3a1; }
  .npc-status.status-tot      { color: #6c7086; border-color: #45475a; }
  .npc-status.status-vermisst { color: #fab387; border-color: #fab387; }
  .npc-status.status-unbekannt{ color: #89b4fa; border-color: #89b4fa; }

  .npc-role {
    background: none;
    border: none;
    border-bottom: 1px solid #313244;
    color: #a6adc8;
    font-size: 0.9rem;
    font-style: italic;
    padding: 0.1rem 0;
    outline: none;
    font-family: inherit;
    width: 100%;
  }
  .npc-role:focus { border-bottom-color: #89b4fa; }

  /* Section labels */
  .section-label {
    font-size: 0.68rem;
    font-weight: 700;
    color: #45475a;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-top: 0.75rem;
    padding-bottom: 0.2rem;
    border-bottom: 1px solid #313244;
  }

  /* Narrative fields */
  .npc-fields { display: flex; flex-direction: column; gap: 0.45rem; }

  .npc-field { display: flex; flex-direction: column; gap: 0.15rem; }
  .npc-field label {
    font-size: 0.68rem;
    font-weight: 600;
    color: #6c7086;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .npc-field textarea, .npc-field input, .tags-input {
    background: #181825;
    border: 1px solid #313244;
    border-radius: 4px;
    color: #cdd6f4;
    font-size: 0.88rem;
    line-height: 1.6;
    padding: 0.35rem 0.55rem;
    outline: none;
    resize: vertical;
    font-family: inherit;
    transition: border-color 0.1s;
  }
  .npc-field textarea:focus, .npc-field input:focus, .tags-input:focus { border-color: #89b4fa; }
  .secret-field label { color: #f38ba8; }
  .secret-field textarea { border-color: #45475a; }
  .tags-input { resize: none; }

  /* Combat row */
  .combat-row {
    display: flex;
    gap: 0.75rem;
    margin-top: 0.25rem;
  }
  .combat-field { display: flex; flex-direction: column; gap: 0.15rem; flex: 1; }
  .combat-field label {
    font-size: 0.68rem;
    font-weight: 600;
    color: #6c7086;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .combat-field input {
    background: #181825;
    border: 1px solid #313244;
    border-radius: 4px;
    color: #cdd6f4;
    font-size: 0.88rem;
    padding: 0.35rem 0.55rem;
    outline: none;
    font-family: inherit;
    transition: border-color 0.1s;
  }
  .combat-field input:focus { border-color: #89b4fa; }

  /* Stats grid */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 0.4rem;
    margin-top: 0.25rem;
  }
  .stat-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.1rem;
    background: #181825;
    border: 1px solid #313244;
    border-radius: 4px;
    padding: 0.3rem 0.2rem;
  }
  .stat-label {
    font-size: 0.62rem;
    font-weight: 700;
    color: #6c7086;
    text-transform: uppercase;
  }
  .stat-input {
    width: 100%;
    background: none;
    border: none;
    color: #cdd6f4;
    font-size: 0.9rem;
    font-weight: 600;
    text-align: center;
    outline: none;
    font-family: inherit;
    padding: 0;
  }
  .stat-mod {
    font-size: 0.7rem;
    color: #89b4fa;
  }

  /* Tag lists (skills, spells, inventory) */
  .tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    min-height: 1.5rem;
  }
  .tag-item {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    font-size: 0.78rem;
    padding: 0.15rem 0.4rem 0.15rem 0.55rem;
    border-radius: 99px;
    background: #313244;
    color: #cdd6f4;
    border: 1px solid #45475a;
  }
  .spell-tag  { color: #cba6f7; border-color: #cba6f7; background: color-mix(in srgb, #cba6f7 8%, #313244); }
  .inv-tag    { color: #fab387; border-color: #fab387; background: color-mix(in srgb, #fab387 8%, #313244); }
  .tag-remove {
    background: none; border: none; color: #6c7086; cursor: pointer;
    font-size: 0.8rem; line-height: 1; padding: 0 0.1rem; border-radius: 99px;
  }
  .tag-remove:hover { color: #f38ba8; }

  /* Add row */
  .add-row {
    display: flex;
    gap: 0.35rem;
    align-items: center;
    margin-top: 0.2rem;
  }
  .add-input {
    flex: 1;
    background: #181825;
    border: 1px solid #313244;
    border-radius: 4px;
    color: #cdd6f4;
    font-size: 0.82rem;
    padding: 0.25rem 0.5rem;
    outline: none;
    font-family: inherit;
    transition: border-color 0.1s;
  }
  .add-input:focus { border-color: #89b4fa; }
  .add-val { max-width: 5rem; }
  .add-btn {
    background: none;
    border: 1px dashed #45475a;
    border-radius: 4px;
    color: #6c7086;
    font-size: 1rem;
    line-height: 1;
    padding: 0.2rem 0.5rem;
    cursor: pointer;
    transition: color 0.1s, border-color 0.1s;
  }
  .add-btn:hover { color: #cba6f7; border-color: #cba6f7; }

  /* Tags field */
  .npc-tags-field { display: flex; flex-direction: column; gap: 0.15rem; }
  .npc-tags-field label {
    font-size: 0.68rem; font-weight: 600; color: #6c7086;
    text-transform: uppercase; letter-spacing: 0.04em;
  }

  /* Footer */
  .npc-footer {
    display: flex; align-items: center; gap: 0.5rem; padding-top: 0.25rem;
  }
  .save-status { font-size: 0.7rem; color: #f38ba8; }
  .save-error  { font-size: 0.75rem; color: #f38ba8; flex: 1; }
  .json-btn {
    margin-left: auto; background: none; border: 1px solid #313244; border-radius: 4px;
    color: #6c7086; font-size: 0.75rem; padding: 0.2rem 0.55rem; cursor: pointer; font-family: inherit;
  }
  .json-btn:hover { border-color: #6c7086; color: #cdd6f4; }

  /* JSON view */
  .npc-json-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }
  .json-toolbar {
    display: flex; align-items: center; gap: 0.5rem;
    padding: 0.4rem 1rem; background: #181825; border-bottom: 1px solid #313244;
  }
  .json-label { font-size: 0.75rem; color: #6c7086; }
  .json-error { font-size: 0.75rem; color: #f38ba8; }
  .json-toolbar button {
    background: none; border: 1px solid #313244; border-radius: 4px;
    color: #cdd6f4; font-size: 0.8rem; padding: 0.2rem 0.6rem; cursor: pointer; font-family: inherit;
  }
  .json-toolbar button:hover { border-color: #89b4fa; color: #89b4fa; }
  .json-ta {
    flex: 1; padding: 1rem 1.5rem; background: #1e1e2e; color: #cdd6f4;
    border: none; outline: none;
    font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.88rem;
    line-height: 1.7; resize: none;
  }
</style>
