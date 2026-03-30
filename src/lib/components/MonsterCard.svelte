<script lang="ts">
  import { activeFile, setFileContent } from '../stores/campaign';
  import { invoke } from '@tauri-apps/api/core';
  import { get } from 'svelte/store';
  import { onMount } from 'svelte';
  import { pushError } from '../stores/errors';
  import type { Monster, MonsterAction } from '../types';

  function parseMonster(json: string): Monster | null {
    try {
      const obj = JSON.parse(json);
      if (!obj || typeof obj !== 'object' || !('stats' in obj) || !('cr' in obj)) return null;
      // Ensure all array/object fields exist so the template never crashes
      obj.traits ??= []; obj.actions ??= []; obj.reactions ??= []; obj.legendary_actions ??= [];
      obj.tags ??= []; obj.damage_resistances ??= []; obj.damage_immunities ??= [];
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

  let draft = $state<Monster | null>(null);
  let dirty = $state(false);
  let saveError = $state('');
  let showJson = $state(false);
  let rawJson = $state('');
  let jsonError = $state('');
  let lastSavedContent = $state('');

  onMount(() => {
    async function load(path: string) {
      try {
        const content = await invoke<string>('read_file_content', { path });
        lastSavedContent = content;
        const parsed = parseMonster(content);
        draft = parsed ? structuredClone(parsed) : null;
        dirty = false;
        saveError = '';
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

  // JSON editor
  function openJson() { rawJson = JSON.stringify(draft, null, 2); jsonError = ''; showJson = true; }
  function cancelJson() { showJson = false; }
  async function saveJson() {
    try {
      JSON.parse(rawJson);
      jsonError = '';
      const file = $activeFile;
      if (file?.path) {
        lastSavedContent = rawJson;
        await invoke('write_file_content', { path: file.path, content: rawJson });
        setFileContent(rawJson);
      }
      showJson = false;
      dirty = false;
    } catch (e) {
      jsonError = `Ungültiges JSON: ${e}`;
    }
  }

  // Array helpers
  function addAction(arr: MonsterAction[]) {
    arr.push({ name: 'Neue Aktion', description: '' });
    mark();
  }
  function removeAction(arr: MonsterAction[], i: number) {
    arr.splice(i, 1);
    mark();
  }

  // KV helpers
  function kvKeys(obj: Record<string, string>): string[] { return Object.keys(obj); }
  function addKv(obj: Record<string, string>) {
    obj[`neu_${Date.now()}`] = '';
    mark();
  }
  function removeKv(obj: Record<string, string>, key: string) {
    delete obj[key];
    mark();
  }
  function renameKv(obj: Record<string, string>, oldKey: string, newKey: string) {
    if (oldKey === newKey || newKey in obj) return;
    const val = obj[oldKey];
    const keys = Object.keys(obj);
    const idx = keys.indexOf(oldKey);
    const entries = keys.map(k => [k, obj[k]] as [string, string]);
    entries[idx] = [newKey, val];
    for (const k of Object.keys(obj)) delete obj[k];
    for (const [k, v] of entries) obj[k] = v;
    mark();
  }

  const STAT_LABELS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;
  type StatKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  const STAT_KEYS: StatKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
</script>

<div class="monster-panel">
  {#if showJson}
    <div class="json-editor">
      <div class="json-toolbar">
        <span class="json-label">JSON bearbeiten</span>
        {#if jsonError}<span class="json-error">{jsonError}</span>{/if}
        <button class="save-btn" onclick={saveJson}>Speichern</button>
        <button class="cancel-btn" onclick={cancelJson}>Abbrechen</button>
      </div>
      <textarea class="json-textarea" bind:value={rawJson} spellcheck="false"></textarea>
    </div>
  {:else if draft}
    <!-- Save bar -->
    {#if dirty}
      <div class="save-bar">
        {#if saveError}<span class="save-error">{saveError}</span>{/if}
        <button class="save-btn" onclick={save}>Speichern</button>
        <button class="cancel-btn" onclick={discard}>Verwerfen</button>
      </div>
    {/if}

    <div class="stat-block">
      <!-- Header -->
      <div class="sb-header">
        <input
          class="editable-field sb-name-input"
          bind:value={draft.name}
          oninput={mark}
          placeholder="Name"
        />
        <div class="sb-meta-row">
          <input class="editable-field sb-meta-input" bind:value={draft.size} oninput={mark} placeholder="Größe" />
          <input class="editable-field sb-meta-input" bind:value={draft.type} oninput={mark} placeholder="Typ" />
          <span class="sb-meta-sep">,</span>
          <input class="editable-field sb-meta-input" bind:value={draft.alignment} oninput={mark} placeholder="Gesinnung" />
        </div>
      </div>

      <div class="sb-divider"></div>

      <!-- AC / HP / Speed -->
      <div class="sb-section">
        <div class="sb-prop">
          <span class="sb-label">Rüstungsklasse</span>
          <input class="editable-field num-input" type="number" bind:value={draft.ac.value} oninput={mark} />
          <input class="editable-field sb-note-input" bind:value={draft.ac.note} oninput={mark} placeholder="(z.B. natürliche Rüstung)" />
        </div>
        <div class="sb-prop">
          <span class="sb-label">Trefferpunkte</span>
          <input class="editable-field num-input" type="number" bind:value={draft.hp.average} oninput={mark} />
          <input class="editable-field sb-note-input" bind:value={draft.hp.formula} oninput={mark} placeholder="Formel" />
        </div>
        <div class="sb-prop">
          <span class="sb-label">Bewegungsrate</span>
          <input class="editable-field sb-wide-input" bind:value={draft.speed} oninput={mark} placeholder="9 m" />
        </div>
      </div>

      <div class="sb-divider"></div>

      <!-- Stats grid -->
      <div class="sb-stats">
        {#each STAT_LABELS as label, i}
          <div class="sb-stat">
            <div class="sb-stat-label">{label}</div>
            <input
              class="editable-field sb-stat-input"
              type="number"
              bind:value={draft.stats[STAT_KEYS[i]]}
              oninput={mark}
            />
            <div class="sb-stat-mod">({mod(draft.stats[STAT_KEYS[i]])})</div>
          </div>
        {/each}
      </div>

      <div class="sb-divider"></div>

      <!-- Secondary props -->
      <div class="sb-section">
        <!-- Saving throws -->
        <div class="sb-kv-row">
          <span class="sb-label">Rettungswürfe</span>
          <div class="kv-list">
            {#each kvKeys(draft.saving_throws) as key}
              <span class="kv-pair">
                <input class="editable-field kv-key-input" value={key}
                  onblur={(e) => renameKv(draft!.saving_throws, key, e.currentTarget.value)} />
                <input class="editable-field kv-val-input" bind:value={draft.saving_throws[key]} oninput={mark} />
                <button class="kv-remove" onclick={() => removeKv(draft!.saving_throws, key)}>×</button>
              </span>
            {/each}
            <button class="kv-add" onclick={() => addKv(draft!.saving_throws)}>+</button>
          </div>
        </div>
        <!-- Skills -->
        <div class="sb-kv-row">
          <span class="sb-label">Fertigkeiten</span>
          <div class="kv-list">
            {#each kvKeys(draft.skills) as key}
              <span class="kv-pair">
                <input class="editable-field kv-key-input" value={key}
                  onblur={(e) => renameKv(draft!.skills, key, e.currentTarget.value)} />
                <input class="editable-field kv-val-input" bind:value={draft.skills[key]} oninput={mark} />
                <button class="kv-remove" onclick={() => removeKv(draft!.skills, key)}>×</button>
              </span>
            {/each}
            <button class="kv-add" onclick={() => addKv(draft!.skills)}>+</button>
          </div>
        </div>
        <!-- Resistances / Immunities -->
        <div class="sb-prop">
          <span class="sb-label">Resistenzen</span>
          <input class="editable-field sb-wide-input" value={draft.damage_resistances.join(', ')}
            oninput={(e) => { draft!.damage_resistances = e.currentTarget.value.split(',').map(s => s.trim()).filter(Boolean); mark(); }} />
        </div>
        <div class="sb-prop">
          <span class="sb-label">Schadensimmunitäten</span>
          <input class="editable-field sb-wide-input" value={draft.damage_immunities.join(', ')}
            oninput={(e) => { draft!.damage_immunities = e.currentTarget.value.split(',').map(s => s.trim()).filter(Boolean); mark(); }} />
        </div>
        <div class="sb-prop">
          <span class="sb-label">Zustandsimmunitäten</span>
          <input class="editable-field sb-wide-input" value={draft.condition_immunities.join(', ')}
            oninput={(e) => { draft!.condition_immunities = e.currentTarget.value.split(',').map(s => s.trim()).filter(Boolean); mark(); }} />
        </div>
        <div class="sb-prop">
          <span class="sb-label">Sinne</span>
          <input class="editable-field sb-wide-input" bind:value={draft.senses} oninput={mark} />
        </div>
        <div class="sb-prop">
          <span class="sb-label">Sprachen</span>
          <input class="editable-field sb-wide-input" bind:value={draft.languages} oninput={mark} />
        </div>
        <div class="sb-prop">
          <span class="sb-label">HG</span>
          <input class="editable-field sb-cr-input" bind:value={draft.cr} oninput={mark} />
          <span class="sb-meta-sep">(</span>
          <input class="editable-field num-input" type="number" bind:value={draft.xp} oninput={mark} />
          <span class="sb-meta-sep"> EP)</span>
        </div>
      </div>

      <!-- Traits -->
      {#if draft.traits.length || true}
        <div class="sb-divider"></div>
        <div class="sb-abilities">
          {#each draft.traits as trait, i}
            <div class="sb-action-block">
              <div class="sb-action-header">
                <input class="editable-field sb-action-name-input" bind:value={trait.name} oninput={mark} placeholder="Eigenschaft" />
                <button class="action-remove" onclick={() => removeAction(draft!.traits, i)}>×</button>
              </div>
              <textarea class="editable-field sb-action-desc" bind:value={trait.description} oninput={mark} rows="2"></textarea>
            </div>
          {/each}
          <button class="add-action-btn" onclick={() => addAction(draft!.traits)}>+ Eigenschaft</button>
        </div>
      {/if}

      <!-- Actions -->
      <div class="sb-divider"></div>
      <h3 class="sb-section-title">Aktionen</h3>
      <div class="sb-abilities">
        {#each draft.actions as action, i}
          <div class="sb-action-block">
            <div class="sb-action-header">
              <input class="editable-field sb-action-name-input" bind:value={action.name} oninput={mark} placeholder="Aktion" />
              <button class="action-remove" onclick={() => removeAction(draft!.actions, i)}>×</button>
            </div>
            <div class="sb-action-attack-row">
              <span class="sb-label-sm">Angriffsbonus</span>
              <input class="editable-field num-input-sm" type="number"
                value={action.attack_bonus ?? ''}
                oninput={(e) => { action.attack_bonus = e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value); mark(); }} />
              <span class="sb-label-sm">Schaden</span>
              <input class="editable-field sb-wide-input-sm" bind:value={action.damage} oninput={mark} placeholder="1W6+2 Stich" />
            </div>
            <textarea class="editable-field sb-action-desc" bind:value={action.description} oninput={mark} rows="2"></textarea>
          </div>
        {/each}
        <button class="add-action-btn" onclick={() => addAction(draft!.actions)}>+ Aktion</button>
      </div>

      <!-- Reactions -->
      {#if draft.reactions.length || true}
        <div class="sb-divider"></div>
        <h3 class="sb-section-title">Reaktionen</h3>
        <div class="sb-abilities">
          {#each draft.reactions as reaction, i}
            <div class="sb-action-block">
              <div class="sb-action-header">
                <input class="editable-field sb-action-name-input" bind:value={reaction.name} oninput={mark} placeholder="Reaktion" />
                <button class="action-remove" onclick={() => removeAction(draft!.reactions, i)}>×</button>
              </div>
              <textarea class="editable-field sb-action-desc" bind:value={reaction.description} oninput={mark} rows="2"></textarea>
            </div>
          {/each}
          <button class="add-action-btn" onclick={() => addAction(draft!.reactions)}>+ Reaktion</button>
        </div>
      {/if}

      <!-- Legendary Actions -->
      {#if draft.legendary_actions.length || true}
        <div class="sb-divider"></div>
        <h3 class="sb-section-title">Legendäre Aktionen</h3>
        <div class="sb-abilities">
          {#each draft.legendary_actions as la, i}
            <div class="sb-action-block">
              <div class="sb-action-header">
                <input class="editable-field sb-action-name-input" bind:value={la.name} oninput={mark} placeholder="Legendäre Aktion" />
                <button class="action-remove" onclick={() => removeAction(draft!.legendary_actions, i)}>×</button>
              </div>
              <textarea class="editable-field sb-action-desc" bind:value={la.description} oninput={mark} rows="2"></textarea>
            </div>
          {/each}
          <button class="add-action-btn" onclick={() => addAction(draft!.legendary_actions)}>+ Legendäre Aktion</button>
        </div>
      {/if}

      <!-- Tags -->
      <div class="sb-divider"></div>
      <div class="sb-prop">
        <span class="sb-label">Tags</span>
        <input class="editable-field sb-wide-input" value={draft.tags.join(', ')}
          oninput={(e) => { draft!.tags = e.currentTarget.value.split(',').map(s => s.trim()).filter(Boolean); mark(); }} />
      </div>

      <div class="sb-footer">
        <button class="json-btn" onclick={openJson}>JSON</button>
      </div>
    </div>
  {:else}
    <div class="parse-error">Ungültiges Monster-JSON. <button onclick={openJson}>JSON bearbeiten</button></div>
  {/if}
</div>

<style>
  .monster-panel {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
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

  /* ── Editable field base ── */
  .editable-field {
    background: transparent;
    border: 1px solid transparent;
    color: inherit;
    font: inherit;
    padding: 0.1rem 0.25rem;
    border-radius: 3px;
    outline: none;
    transition: border-color 0.1s, background 0.1s;
  }

  .editable-field:hover {
    border-color: #45475a;
    background: #1a1a2a;
  }

  .editable-field:focus {
    border-color: #f38ba8;
    background: #1a1a2a;
  }

  /* ── Header ── */
  .sb-header { margin-bottom: 0.4rem; }

  .sb-name-input {
    font-size: 1.3rem;
    font-weight: 700;
    color: #f38ba8;
    font-variant: small-caps;
    width: 100%;
    margin-bottom: 0.1rem;
  }

  .sb-meta-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.1rem;
    font-style: italic;
    color: #a6adc8;
    font-size: 0.85rem;
  }

  .sb-meta-input {
    font-style: italic;
    color: #a6adc8;
    font-size: 0.85rem;
    width: auto;
    min-width: 60px;
  }

  .sb-meta-sep {
    color: #a6adc8;
    padding: 0 0.1rem;
  }

  /* ── Divider ── */
  .sb-divider {
    height: 2px;
    background: linear-gradient(to right, #7f3f3f, #6b3a3a55);
    margin: 0.6rem 0;
    border-radius: 1px;
  }

  /* ── Section ── */
  .sb-section { display: flex; flex-direction: column; gap: 0.15rem; }

  .sb-prop {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.2rem;
    line-height: 1.8;
  }

  .sb-label {
    font-weight: 700;
    color: #f38ba8;
    white-space: nowrap;
  }

  .sb-label-sm {
    font-weight: 700;
    color: #f38ba888;
    font-size: 0.78rem;
    white-space: nowrap;
  }

  .num-input {
    width: 52px;
    text-align: center;
  }

  .num-input-sm {
    width: 44px;
    text-align: center;
    font-size: 0.82rem;
  }

  .sb-note-input { min-width: 80px; color: #a6adc8; font-style: italic; }
  .sb-wide-input { flex: 1; min-width: 120px; }
  .sb-wide-input-sm { flex: 1; min-width: 80px; font-size: 0.82rem; }
  .sb-cr-input { width: 40px; text-align: center; }

  /* ── Stats ── */
  .sb-stats {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    text-align: center;
    gap: 0.25rem;
  }

  .sb-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.05rem;
  }

  .sb-stat-label {
    font-size: 0.72rem;
    font-weight: 700;
    color: #f38ba8;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .sb-stat-input {
    width: 46px;
    text-align: center;
    font-size: 1rem;
    font-weight: 600;
    padding: 0.1rem;
  }

  .sb-stat-mod { font-size: 0.78rem; color: #a6adc8; }

  /* ── KV pairs ── */
  .sb-kv-row {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    flex-wrap: wrap;
    line-height: 1.8;
  }

  .kv-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem;
    align-items: center;
  }

  .kv-pair {
    display: flex;
    align-items: center;
    gap: 0.1rem;
  }

  .kv-key-input {
    width: 80px;
    font-size: 0.85rem;
  }

  .kv-val-input {
    width: 44px;
    font-size: 0.85rem;
    color: #a6e3a1;
  }

  .kv-remove {
    background: none;
    border: none;
    color: #45475a;
    cursor: pointer;
    font-size: 0.85rem;
    padding: 0 0.2rem;
    line-height: 1;
  }
  .kv-remove:hover { color: #f38ba8; }

  .kv-add {
    background: none;
    border: 1px dashed #45475a;
    color: #6c7086;
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0.05rem 0.35rem;
    border-radius: 3px;
  }
  .kv-add:hover { border-color: #f38ba8; color: #f38ba8; }

  /* ── Actions / Traits ── */
  .sb-section-title {
    font-size: 1rem;
    font-weight: 700;
    color: #f38ba8;
    margin: 0 0 0.3rem;
    font-variant: small-caps;
    border-bottom: 1px solid #6b3a3a;
    padding-bottom: 0.15rem;
  }

  .sb-abilities {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .sb-action-block {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    border-left: 2px solid #6b3a3a44;
    padding-left: 0.5rem;
  }

  .sb-action-header {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .sb-action-name-input {
    font-weight: 700;
    font-style: italic;
    color: #cdd6f4;
    flex: 1;
    min-width: 0;
  }

  .sb-action-attack-row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    flex-wrap: wrap;
  }

  .sb-action-desc {
    width: 100%;
    resize: vertical;
    line-height: 1.5;
    font-size: 0.85rem;
    color: #cdd6f4;
    min-height: 2.5rem;
  }

  .action-remove {
    background: none;
    border: none;
    color: #45475a;
    cursor: pointer;
    font-size: 1rem;
    padding: 0 0.2rem;
    flex-shrink: 0;
  }
  .action-remove:hover { color: #f38ba8; }

  .add-action-btn {
    background: none;
    border: 1px dashed #45475a;
    color: #6c7086;
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0.15rem 0.5rem;
    border-radius: 3px;
    align-self: flex-start;
  }
  .add-action-btn:hover { border-color: #f38ba8; color: #f38ba8; }

  /* ── Footer ── */
  .sb-footer {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.75rem;
    padding-top: 0.5rem;
    border-top: 1px solid #45475a33;
  }

  .json-btn {
    background: transparent;
    border: 1px solid #45475a;
    color: #45475a;
    border-radius: 4px;
    padding: 0.2rem 0.5rem;
    cursor: pointer;
    font-size: 0.75rem;
  }
  .json-btn:hover { border-color: #6c7086; color: #6c7086; }

  /* ── JSON Editor ── */
  .json-editor { display: flex; flex-direction: column; width: 100%; max-width: 700px; gap: 0.5rem; }
  .json-toolbar { display: flex; align-items: center; gap: 0.5rem; }
  .json-label { flex: 1; font-size: 0.85rem; color: #6c7086; }
  .json-error { color: #f38ba8; font-size: 0.8rem; }
  .json-textarea { flex: 1; min-height: 600px; background: #181825; border: 1px solid #313244; border-radius: 4px; color: #cdd6f4; font-family: 'JetBrains Mono', monospace; font-size: 0.82rem; padding: 1rem; outline: none; resize: vertical; line-height: 1.6; }

  .save-btn { background: #a6e3a1; color: #1e1e2e; border: none; border-radius: 4px; padding: 0.25rem 0.75rem; cursor: pointer; font-size: 0.82rem; font-weight: 600; }
  .cancel-btn { background: transparent; border: 1px solid #45475a; color: #6c7086; border-radius: 4px; padding: 0.25rem 0.75rem; cursor: pointer; font-size: 0.82rem; }

  .parse-error { color: #f38ba8; font-size: 0.9rem; }
  .parse-error button { background: none; border: none; color: #89b4fa; cursor: pointer; text-decoration: underline; }
</style>
