<script lang="ts">
  import { activeFile, setFileContent } from '../stores/campaign';
  import { invoke } from '@tauri-apps/api/core';
  import { get } from 'svelte/store';
  import { onMount } from 'svelte';
  import { pushError } from '../stores/errors';
  import type { Monster } from '../types';
  import { normalizeMonster } from '../types';
  import MonsterStatBlock from './MonsterStatBlock.svelte';
  import MonsterEditForm from './MonsterEditForm.svelte';

  function parseMonster(json: string): Monster | null {
    try {
      const obj = JSON.parse(json);
      if (!obj || typeof obj !== 'object' || !('stats' in obj) || !('cr' in obj)) return null;
      // Ensure all array/object fields exist so the template never crashes
      return normalizeMonster(obj as Monster);
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

</style>
