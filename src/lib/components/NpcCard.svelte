<script lang="ts">
  import { activeFile, fileContent, setFileContent } from '../stores/campaign';
  import { invoke } from '@tauri-apps/api/core';
  import { get } from 'svelte/store';
  import { onMount } from 'svelte';
  import { pushError } from '../stores/errors';
  import { getSpellLibrary, loadSpellByPath, searchSpells, SCHOOL_COLORS, type SpellSuggestion } from '../spellLibrary';
  import type { Spell } from '../types';
  import { SKILL_DEFS } from '../pdf/characterFields';

  interface NpcStats {
    str: number; dex: number; con: number;
    int: number; wis: number; cha: number;
  }

  interface NpcSkill {
    bonus: number;
    prof: boolean;
  }

  interface NpcSpell {
    name: string;
    level: number; // 0 = Zaubertrick
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
    savingThrows: Record<string, NpcSkill>;
    skills: Record<string, NpcSkill>;
    spells: NpcSpell[];
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
      obj.stats        ??= { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
      obj.savingThrows ??= {};
      obj.skills       ??= {};
      obj.spells       ??= [];
      obj.inventory    ??= [];
      obj.tags         ??= [];
      // migrate old string-valued skills/savingThrows → { bonus, prof }
      for (const key of Object.keys(obj.skills)) {
        const v = obj.skills[key];
        if (typeof v === 'string') obj.skills[key] = { bonus: parseInt(v) || 0, prof: false };
      }
      for (const key of Object.keys(obj.savingThrows)) {
        const v = obj.savingThrows[key];
        if (typeof v === 'string') obj.savingThrows[key] = { bonus: parseInt(v) || 0, prof: false };
      }
      // migrate old string spells → { name, level }
      obj.spells = (obj.spells as unknown[]).map((s) =>
        typeof s === 'string' ? { name: s, level: 1 } : s
      );
      return obj as NpcData;
    } catch { return null; }
  }

  function modNum(score: number): number { return Math.floor((score - 10) / 2); }
  function modStr(score: number): string {
    const m = modNum(score);
    return m >= 0 ? `+${m}` : `${m}`;
  }
  function sign(n: number): string { return n >= 0 ? `+${n}` : `${n}`; }

  const STAT_LABELS: (keyof NpcStats)[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  const STAT_NAMES: Record<keyof NpcStats, string> = {
    str: 'STR', dex: 'GES', con: 'KON', int: 'INT', wis: 'WEI', cha: 'CHA',
  };

  // Maps SKILL_DEFS.attr (character keys) to NpcStats keys
  const CHAR_ATTR_TO_NPC: Record<string, keyof NpcStats> = {
    str: 'str', ges: 'dex', kon: 'con', int: 'int', wei: 'wis', cha: 'cha',
  };

  let draft = $state<NpcData | null>(null);
  let dirty = $state(false);
  let saveError = $state('');
  let showJson = $state(false);
  let rawJson = $state('');
  let jsonError = $state('');

  // Spell editing + autocomplete
  let newSpell = $state('');
  let newSpellLevel = $state(1);
  let spellLibrary = $state<Awaited<ReturnType<typeof getSpellLibrary>>>([]);
  let spellSuggestions = $state<SpellSuggestion[]>([]);
  let spellSugIndex = $state(-1);

  $effect(() => { getSpellLibrary().then(lib => { spellLibrary = lib; }); });

  const spellInfoMap = $derived(new Map(spellLibrary.map(s => [s.name, s])));

  // Spell cards (expand/collapse)
  let expandedSpells = $state(new Set<string>());
  let spellDataCache = $state(new Map<string, Spell | null>());
  let loadingSpells = $state(new Set<string>());

  async function toggleSpellCard(name: string) {
    if (expandedSpells.has(name)) {
      expandedSpells.delete(name);
      expandedSpells = new Set(expandedSpells);
      return;
    }
    expandedSpells.add(name);
    expandedSpells = new Set(expandedSpells);
    if (!spellDataCache.has(name) && !loadingSpells.has(name)) {
      const info = spellInfoMap.get(name);
      if (info?.path) {
        loadingSpells.add(name); loadingSpells = new Set(loadingSpells);
        const data = await loadSpellByPath(info.path);
        spellDataCache.set(name, data); spellDataCache = new Map(spellDataCache);
        loadingSpells.delete(name); loadingSpells = new Set(loadingSpells);
      }
    }
  }

  const SCHOOL_LABELS: Record<string, string> = {
    abjuration: 'Bannmagie', conjuration: 'Beschwörung', divination: 'Erkenntnismagie',
    enchantment: 'Verzauberung', evocation: 'Hervorrufung', illusion: 'Illusionsmagie',
    necromancy: 'Nekromantie', transmutation: 'Verwandlung',
  };

  function componentStr(s: Spell): string {
    const parts: string[] = [];
    if (s.components.verbal)   parts.push('V');
    if (s.components.somatic)  parts.push('G');
    if (s.components.material) parts.push('M');
    return parts.join(', ') || '—';
  }

  function onSpellInput() {
    spellSuggestions = newSpell.length > 0
      ? searchSpells(spellLibrary, newSpell, null, '')
      : [];
    spellSugIndex = -1;
  }

  function selectSpellSuggestion(name: string) {
    newSpell = name;
    spellSuggestions = [];
    spellSugIndex = -1;
  }

  function onSpellKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); spellSugIndex = Math.min(spellSugIndex + 1, spellSuggestions.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); spellSugIndex = Math.max(spellSugIndex - 1, -1); }
    else if (e.key === 'Escape') { spellSuggestions = []; }
    else if (e.key === 'Enter') {
      if (spellSugIndex >= 0 && spellSuggestions[spellSugIndex]) {
        selectSpellSuggestion(spellSuggestions[spellSugIndex].spell.name);
      } else {
        addSpell();
      }
    }
  }
  // Inventory editing
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

  // Saving throws: click prof-dot to toggle proficiency on/off
  function toggleSaveProf(key: string) {
    if (!draft) return;
    const stored = draft.savingThrows[key];
    if (stored?.prof) {
      delete draft.savingThrows[key];
    } else {
      const base = modNum(draft.stats[key as keyof NpcStats]);
      draft.savingThrows[key] = { bonus: base + 2, prof: true };
    }
    draft = draft;
    scheduleSave();
  }

  function toggleSkillProf(key: string) {
    if (!draft) return;
    const stored = draft.skills[key];
    if (stored?.prof) {
      delete draft.skills[key];
    } else {
      const skillDef = SKILL_DEFS.find(s => s.key === key);
      const statKey = skillDef ? CHAR_ATTR_TO_NPC[skillDef.attr] : 'str';
      const base = modNum(draft.stats[statKey]);
      draft.skills[key] = { bonus: base + 2, prof: true };
    }
    draft = draft;
    scheduleSave();
  }

  function addSpell() {
    if (!draft || !newSpell.trim()) return;
    draft.spells = [...draft.spells, { name: newSpell.trim(), level: newSpellLevel }];
    newSpell = ''; newSpellLevel = 1; spellSuggestions = [];
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
  <div class="npc-sheet">

    <!-- Header -->
    <div class="npc-header">
      <div class="name-block">
        <input class="npc-name" bind:value={draft.name} oninput={scheduleSave} placeholder="Name" />
        <input class="npc-role" bind:value={draft.role} oninput={scheduleSave} placeholder="Rolle" />
      </div>
      <div class="header-right">
        <select class="npc-status status-{draft.status}" bind:value={draft.status} onchange={scheduleSave}>
          {#each Object.entries(STATUS_LABELS) as [val, label]}
            <option value={val}>{label}</option>
          {/each}
        </select>
        <div class="header-foot">
          {#if saveError}<span class="save-error-msg">{saveError}</span>{/if}
          <span class="dirty-dot">{dirty ? '●' : ''}</span>
          <button class="json-btn" onclick={openJson}>JSON</button>
        </div>
      </div>
    </div>

    <div class="npc-content">

      <!-- Attribute -->
      <div class="section attributes">
        {#each STAT_LABELS as attr}
          <div class="attr-box">
            <div class="attr-label">{STAT_NAMES[attr]}</div>
            <div class="attr-mod">{modStr(draft.stats[attr])}</div>
            <input class="attr-score" type="number" bind:value={draft.stats[attr]} oninput={scheduleSave} />
          </div>
        {/each}
      </div>

      <!-- Kampf + Rettungswürfe -->
      <div class="two-col">
        <div class="section">
          <h3>Kampf</h3>
          <div class="stats-grid">
            <div class="stat">
              <span class="sl">RK</span>
              <input class="sv sv-input" type="number" bind:value={draft.ac} oninput={scheduleSave} />
            </div>
            <div class="stat">
              <span class="sl">TP</span>
              <input class="sv sv-input wide" bind:value={draft.hp} oninput={scheduleSave} placeholder="z.B. 27 (5W8+5)" />
            </div>
            <div class="stat">
              <span class="sl">Tempo</span>
              <input class="sv sv-input wide" bind:value={draft.speed} oninput={scheduleSave} placeholder="z.B. 9 m" />
            </div>
          </div>
        </div>

        <div class="section">
          <h3>Rettungswürfe <span class="h3-hint">● = Klick zum Umschalten</span></h3>
          <div class="save-list">
            {#each STAT_LABELS as key}
              {@const stored = draft.savingThrows[key]}
              {@const base = modNum(draft.stats[key])}
              {@const bonus = stored ? stored.bonus : base}
              {@const prof = stored?.prof ?? false}
              <div class="save-row" class:proficient={prof}>
                <button class="prof-dot" onclick={() => toggleSaveProf(key)} title="Profizenz umschalten">
                  {prof ? '●' : '○'}
                </button>
                <span class="save-label">{STAT_NAMES[key]}</span>
                <span class="save-val">{sign(bonus)}</span>
              </div>
            {/each}
          </div>
        </div>
      </div>

      <!-- Fertigkeiten -->
      <div class="section">
        <h3>Fertigkeiten <span class="h3-hint">● = Klick zum Umschalten</span></h3>
        <div class="skill-grid">
          {#each SKILL_DEFS as def}
            {@const stored = draft.skills[def.key]}
            {@const statKey = CHAR_ATTR_TO_NPC[def.attr]}
            {@const base = modNum(draft.stats[statKey])}
            {@const bonus = stored ? stored.bonus : base}
            {@const prof = stored?.prof ?? false}
            <div class="skill-row" class:proficient={prof}>
              <button class="prof-dot" onclick={() => toggleSkillProf(def.key)} title="Profizenz umschalten">
                {prof ? '●' : '○'}
              </button>
              <span class="skill-name">{def.key}</span>
              <span class="skill-val">{sign(bonus)}</span>
            </div>
          {/each}
        </div>
      </div>

      <!-- Zauber -->
      <div class="section">
        <h3>Zauber</h3>
        <div class="spell-cards">
          {#each draft.spells as spell, i}
            {@const info = spellInfoMap.get(spell.name)}
            {@const color = info ? (SCHOOL_COLORS[info.school] ?? '#585b70') : '#585b70'}
            {@const expanded = expandedSpells.has(spell.name)}
            {@const data = spellDataCache.get(spell.name) ?? null}
            <div class="scard" class:expanded style="--sc:{color}"
              role="button" tabindex="0"
              onclick={() => toggleSpellCard(spell.name)}
              onkeydown={(e) => e.key === 'Enter' && toggleSpellCard(spell.name)}>
              <div class="scard-head">
                <span class="spell-level-badge">{spell.level === 0 ? 'ZT' : spell.level}</span>
                <span class="scard-name">{spell.name}</span>
                <span class="scard-badges">
                  {#if info?.school}<span class="scard-school">{SCHOOL_LABELS[info.school] ?? info.school}</span>{/if}
                </span>
                <button class="scard-remove" onclick={(e) => { e.stopPropagation(); removeSpell(i); }} title="Entfernen">×</button>
                <span class="scard-chevron">{expanded ? '▲' : '▼'}</span>
              </div>
              {#if expanded}
                <div class="scard-body" onclick={(e) => e.stopPropagation()}>
                  {#if loadingSpells.has(spell.name)}
                    <span class="scard-loading">Lädt…</span>
                  {:else if data}
                    <div class="scard-props">
                      <span class="sp-label">Zauberdauer</span><span class="sp-val">{data.casting_time}</span>
                      <span class="sp-label">Reichweite</span><span class="sp-val">{data.range}</span>
                      <span class="sp-label">Komponenten</span><span class="sp-val">{componentStr(data)}{data.components.materials_needed ? ` (${data.components.materials_needed})` : ''}</span>
                      <span class="sp-label">Dauer</span><span class="sp-val">{data.duration}</span>
                    </div>
                    <div class="scard-divider"></div>
                    <div class="scard-desc">{data.description}</div>
                    {#if data.higher_levels}
                      <div class="scard-divider"></div>
                      <div class="scard-higher"><span class="higher-lbl">Auf höheren Graden.</span>{data.higher_levels}</div>
                    {/if}
                  {:else}
                    <span class="scard-loading">Nicht in Bibliothek</span>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
        <div class="add-row">
          <div class="autocomplete-wrap">
            <input class="add-input" bind:value={newSpell} placeholder="Zaubername"
              oninput={onSpellInput}
              onkeydown={onSpellKey}
              onblur={() => setTimeout(() => { spellSuggestions = []; }, 150)} />
            {#if spellSuggestions.length > 0}
              <ul class="suggestions">
                {#each spellSuggestions as sug, i}
                  <li class:active={i === spellSugIndex}
                    onmousedown={() => selectSpellSuggestion(sug.spell.name)}>
                    <span style="color:{SCHOOL_COLORS[sug.spell.school] ?? 'inherit'}">{sug.spell.name}</span>
                    <span class="sug-level">Grad {sug.spell.level === 0 ? 'ZT' : sug.spell.level}</span>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
          <input class="add-input add-num" type="number" min="0" max="9" bind:value={newSpellLevel} placeholder="Stufe" />
          <button class="add-btn" onclick={addSpell}>+</button>
        </div>
      </div>

      <!-- Inventar -->
      <div class="section">
        <h3>Inventar</h3>
        <div class="item-list">
          {#each draft.inventory as item, i}
            <div class="item-row">
              <span class="item-name">{item}</span>
              <button class="row-remove" onclick={() => removeItem(i)}>×</button>
            </div>
          {/each}
        </div>
        <div class="add-row">
          <input class="add-input" bind:value={newItem} placeholder="Gegenstand" onkeydown={(e) => e.key === 'Enter' && addItem()} />
          <button class="add-btn" onclick={addItem}>+</button>
        </div>
      </div>

      <!-- Beschreibung + Hintergrund -->
      <div class="two-col">
        <div class="section">
          <h3>Beschreibung</h3>
          {#each [{ key: 'appearance', label: 'Aussehen' }, { key: 'personality', label: 'Persönlichkeit' }] as field}
            <div class="npc-field">
              <label>{field.label}</label>
              <textarea
                value={draft[field.key as keyof NpcData] as string}
                oninput={(e) => { (draft as Record<string, unknown>)[field.key] = (e.currentTarget as HTMLTextAreaElement).value; scheduleSave(); }}
                rows="2" placeholder="—"
              ></textarea>
            </div>
          {/each}
        </div>
        <div class="section">
          <h3>Hintergrund</h3>
          {#each [{ key: 'motivation', label: 'Motivation' }, { key: 'notes', label: 'Notizen' }] as field}
            <div class="npc-field">
              <label>{field.label}</label>
              <textarea
                value={draft[field.key as keyof NpcData] as string}
                oninput={(e) => { (draft as Record<string, unknown>)[field.key] = (e.currentTarget as HTMLTextAreaElement).value; scheduleSave(); }}
                rows="2" placeholder="—"
              ></textarea>
            </div>
          {/each}
        </div>
      </div>

      <!-- Geheimnis -->
      <div class="section secret-section">
        <h3>Geheimnis</h3>
        <textarea class="secret-ta" bind:value={draft.secret} oninput={scheduleSave} rows="2" placeholder="—"></textarea>
      </div>

      <!-- Tags -->
      <div class="section">
        <h3>Tags</h3>
        <input
          class="tags-input"
          value={tagsString(draft.tags)}
          oninput={(e) => { draft!.tags = parseTags((e.currentTarget as HTMLInputElement).value); scheduleSave(); }}
          placeholder="kommagetrennt"
        />
      </div>

    </div>
  </div>
{/if}

<style>
  .npc-empty { padding: 2rem; color: #6c7086; }

  /* ── Sheet container ─────────────────────────────── */
  .npc-sheet {
    flex: 1;
    overflow-y: auto;
    background: #1e1e2e;
    color: #cdd6f4;
    font-size: 0.9rem;
  }

  /* ── Header ──────────────────────────────────────── */
  .npc-header {
    padding: 0.9rem 1.5rem 0.6rem;
    border-bottom: 1px solid #313244;
    display: flex;
    align-items: flex-start;
    gap: 1rem;
  }

  .name-block { flex: 1; display: flex; flex-direction: column; gap: 0.2rem; }

  .npc-name {
    background: none;
    border: none;
    color: #cba6f7;
    font-size: 1.4rem;
    font-weight: 700;
    padding: 0;
    outline: none;
    font-family: inherit;
    width: 100%;
  }
  .npc-name:focus { border-bottom: 1px solid #89b4fa; }

  .npc-role {
    background: none;
    border: none;
    color: #6c7086;
    font-size: 0.85rem;
    font-style: italic;
    padding: 0;
    outline: none;
    font-family: inherit;
    width: 100%;
  }
  .npc-role:focus { border-bottom: 1px solid #313244; }

  .header-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.35rem;
    flex-shrink: 0;
  }

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
  }
  .npc-status.status-lebendig { color: #a6e3a1; border-color: #a6e3a1; }
  .npc-status.status-tot      { color: #6c7086; border-color: #45475a; }
  .npc-status.status-vermisst { color: #fab387; border-color: #fab387; }
  .npc-status.status-unbekannt{ color: #89b4fa; border-color: #89b4fa; }

  .header-foot {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .dirty-dot { font-size: 0.7rem; color: #f38ba8; width: 0.8rem; }
  .save-error-msg { font-size: 0.72rem; color: #f38ba8; }

  .json-btn {
    background: none;
    border: 1px solid #313244;
    border-radius: 4px;
    color: #6c7086;
    font-size: 0.75rem;
    padding: 0.2rem 0.55rem;
    cursor: pointer;
    font-family: inherit;
  }
  .json-btn:hover { border-color: #6c7086; color: #cdd6f4; }

  /* ── Content area ────────────────────────────────── */
  .npc-content {
    padding: 1rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  /* ── Section ─────────────────────────────────────── */
  .section h3 {
    margin: 0 0 0.4rem;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6c7086;
    border-bottom: 1px solid #313244;
    padding-bottom: 0.2rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .h3-hint {
    font-size: 0.65rem;
    color: #45475a;
    text-transform: none;
    letter-spacing: 0;
    font-weight: 400;
  }

  /* ── Attributes ──────────────────────────────────── */
  .attributes {
    display: flex;
    gap: 0.5rem;
  }

  .attr-box {
    background: #313244;
    border-radius: 6px;
    padding: 0.4rem 0.6rem;
    text-align: center;
    min-width: 52px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.1rem;
  }

  .attr-label { font-size: 0.65rem; color: #6c7086; text-transform: uppercase; }
  .attr-mod   { font-size: 1.15rem; font-weight: 700; color: #cba6f7; line-height: 1.2; }
  .attr-score {
    width: 2.5rem;
    background: none;
    border: none;
    border-top: 1px solid #45475a;
    color: #a6adc8;
    font-size: 0.75rem;
    font-family: inherit;
    text-align: center;
    outline: none;
    padding: 0.1rem 0 0;
  }
  .attr-score:focus { border-top-color: #89b4fa; }

  /* ── Two-column layout ───────────────────────────── */
  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  /* ── Stats grid (Kampf) ──────────────────────────── */
  .stats-grid {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .stat { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
  .sl { color: #6c7086; font-size: 0.8rem; white-space: nowrap; }
  .sv { font-weight: 600; color: #cdd6f4; }

  .sv-input {
    background: #181825;
    border: 1px solid #313244;
    border-radius: 4px;
    color: #cdd6f4;
    font-size: 0.82rem;
    font-weight: 600;
    font-family: inherit;
    padding: 0.15rem 0.4rem;
    outline: none;
    width: 4rem;
    text-align: right;
  }
  .sv-input.wide { width: 8rem; text-align: left; }
  .sv-input:focus { border-color: #89b4fa; }

  /* ── Saving throws ───────────────────────────────── */
  .save-list { display: flex; flex-direction: column; gap: 0.15rem; }

  .save-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.82rem;
  }
  .save-row.proficient .save-val { color: #a6e3a1; }

  .prof-dot {
    background: none;
    border: none;
    padding: 0;
    font-size: 0.65rem;
    color: #6c7086;
    width: 0.8rem;
    cursor: pointer;
    line-height: 1;
  }
  .proficient .prof-dot { color: #a6e3a1; }

  .save-label { flex: 1; color: #a6adc8; }
  .save-val   { font-weight: 600; min-width: 2rem; text-align: right; }

  /* ── Skills ──────────────────────────────────────── */
  .skill-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.1rem 0.5rem;
    margin-bottom: 0.4rem;
  }

  .skill-row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.8rem;
  }
  .skill-row.proficient .skill-val { color: #a6e3a1; }

  .prof-dot-static { font-size: 0.65rem; color: #6c7086; width: 0.8rem; }
  .proficient .prof-dot-static { color: #a6e3a1; }

  .skill-name { flex: 1; color: #a6adc8; }
  .skill-val  { font-weight: 600; min-width: 2rem; text-align: right; }

  /* ── Spell cards ─────────────────────────────────── */
  .spell-cards {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 0.35rem;
  }

  .scard {
    border-left: 3px solid var(--sc);
    background: #1e1e2e;
    border-radius: 0 5px 5px 0;
    cursor: pointer;
    user-select: none;
    transition: background 0.1s;
  }
  .scard:hover { background: #252535; }
  .scard.expanded { background: #181825; }

  .scard-head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.5rem 0.3rem 0.6rem;
    font-size: 0.83rem;
  }

  .spell-level-badge {
    font-size: 0.65rem;
    font-weight: 700;
    color: var(--sc);
    background: color-mix(in srgb, var(--sc) 12%, #1e1e2e);
    border-radius: 3px;
    padding: 0.05rem 0.28rem;
    min-width: 1.4rem;
    text-align: center;
    flex-shrink: 0;
  }

  .scard-name { flex: 1; color: var(--sc); font-weight: 500; }
  .scard-badges { display: flex; gap: 0.3rem; align-items: center; }
  .scard-school {
    font-size: 0.68rem;
    color: #45475a;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .scard-chevron { font-size: 0.55rem; color: #45475a; flex-shrink: 0; }

  .scard-remove {
    background: none;
    border: none;
    color: #45475a;
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0 0.15rem;
    line-height: 1;
    flex-shrink: 0;
  }
  .scard-remove:hover { color: #f38ba8; }

  .scard-body { padding: 0 0.6rem 0.6rem 0.6rem; cursor: default; }

  .scard-props {
    display: grid;
    grid-template-columns: 7rem 1fr;
    gap: 0.2rem 0.4rem;
    font-size: 0.8rem;
    padding-bottom: 0.5rem;
  }
  .sp-label {
    color: #6c7086;
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    align-self: start;
    padding-top: 0.05rem;
  }
  .sp-val { color: #cdd6f4; line-height: 1.4; }

  .scard-divider { height: 1px; background: #313244; margin: 0.4rem 0; }
  .scard-desc { font-size: 0.82rem; color: #cdd6f4; line-height: 1.6; white-space: pre-wrap; }
  .scard-higher { font-size: 0.8rem; color: #a6adc8; line-height: 1.55; white-space: pre-wrap; }
  .higher-lbl { color: var(--sc); font-weight: 700; margin-right: 0.3rem; }
  .scard-loading { font-size: 0.78rem; color: #45475a; font-style: italic; }

  /* ── Inventory list ──────────────────────────────── */
  .item-list {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    margin-bottom: 0.35rem;
  }

  .item-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.82rem;
  }

  .item-name { flex: 1; color: #cdd6f4; }

  .row-remove {
    background: none;
    border: none;
    color: #45475a;
    cursor: pointer;
    font-size: 0.8rem;
    line-height: 1;
    padding: 0 0.1rem;
    flex-shrink: 0;
  }
  .row-remove:hover { color: #f38ba8; }

  /* ── Add row ─────────────────────────────────────── */
  .add-row {
    display: flex;
    gap: 0.35rem;
    align-items: center;
  }

  .add-input {
    flex: 1;
    background: #181825;
    border: 1px solid #313244;
    border-radius: 4px;
    color: #cdd6f4;
    font-size: 0.8rem;
    padding: 0.2rem 0.45rem;
    outline: none;
    font-family: inherit;
  }
  .add-input:focus { border-color: #89b4fa; }
  .add-num { flex: 0 0 3.5rem; text-align: right; }

  .autocomplete-wrap {
    position: relative;
    flex: 1;
    min-width: 0;
  }
  .autocomplete-wrap .add-input { width: 100%; box-sizing: border-box; }

  .suggestions {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 100;
    background: #1e1e2e;
    border: 1px solid #45475a;
    border-top: none;
    border-radius: 0 0 6px 6px;
    margin: 0;
    padding: 0;
    list-style: none;
    max-height: 220px;
    overflow-y: auto;
    box-shadow: 0 6px 16px rgba(0,0,0,0.5);
  }
  .suggestions li {
    padding: 0.3rem 0.6rem;
    cursor: pointer;
    font-size: 0.82rem;
    color: #cdd6f4;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .suggestions li:hover,
  .suggestions li.active { background: #313244; }

  .sug-level {
    font-size: 0.68rem;
    color: #6c7086;
    white-space: nowrap;
  }

  .prof-check {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
    color: #6c7086;
    white-space: nowrap;
    cursor: pointer;
  }
  .prof-check input { cursor: pointer; }

  .add-btn {
    background: none;
    border: 1px dashed #45475a;
    border-radius: 4px;
    color: #6c7086;
    font-size: 1rem;
    line-height: 1;
    padding: 0.15rem 0.45rem;
    cursor: pointer;
  }
  .add-btn:hover { color: #cba6f7; border-color: #cba6f7; }

  /* ── Narrative fields ────────────────────────────── */
  .npc-field { display: flex; flex-direction: column; gap: 0.15rem; margin-bottom: 0.35rem; }

  .npc-field label {
    font-size: 0.68rem;
    font-weight: 600;
    color: #6c7086;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .npc-field textarea {
    background: #181825;
    border: 1px solid #313244;
    border-radius: 4px;
    color: #cdd6f4;
    font-size: 0.85rem;
    line-height: 1.5;
    padding: 0.3rem 0.5rem;
    outline: none;
    resize: vertical;
    font-family: inherit;
  }
  .npc-field textarea:focus { border-color: #89b4fa; }

  .secret-section h3 { color: #f38ba8; border-bottom-color: #f38ba8; }

  .secret-ta {
    width: 100%;
    box-sizing: border-box;
    background: #181825;
    border: 1px solid #45475a;
    border-radius: 4px;
    color: #cdd6f4;
    font-size: 0.85rem;
    line-height: 1.5;
    padding: 0.3rem 0.5rem;
    outline: none;
    resize: vertical;
    font-family: inherit;
  }
  .secret-ta:focus { border-color: #f38ba8; }

  .tags-input {
    width: 100%;
    box-sizing: border-box;
    background: #181825;
    border: 1px solid #313244;
    border-radius: 4px;
    color: #cdd6f4;
    font-size: 0.85rem;
    padding: 0.3rem 0.5rem;
    outline: none;
    font-family: inherit;
  }
  .tags-input:focus { border-color: #89b4fa; }

  /* ── JSON view ───────────────────────────────────── */
  .npc-json-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }

  .json-toolbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 1rem;
    background: #181825;
    border-bottom: 1px solid #313244;
  }
  .json-label { font-size: 0.75rem; color: #6c7086; }
  .json-error { font-size: 0.75rem; color: #f38ba8; }
  .json-toolbar button {
    background: none;
    border: 1px solid #313244;
    border-radius: 4px;
    color: #cdd6f4;
    font-size: 0.8rem;
    padding: 0.2rem 0.6rem;
    cursor: pointer;
    font-family: inherit;
  }
  .json-toolbar button:hover { border-color: #89b4fa; color: #89b4fa; }

  .json-ta {
    flex: 1;
    padding: 1rem 1.5rem;
    background: #1e1e2e;
    color: #cdd6f4;
    border: none;
    outline: none;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 0.88rem;
    line-height: 1.7;
    resize: none;
  }
</style>
