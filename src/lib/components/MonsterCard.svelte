<script lang="ts">
  import { activeFile, setFileContent } from '../stores/campaign';
  import { invoke } from '@tauri-apps/api/core';
  import { get } from 'svelte/store';
  import { onMount } from 'svelte';
  import { pushError } from '../stores/errors';
  import type { Monster } from '../types';
  import MonsterStatBlock from './MonsterStatBlock.svelte';
  import MonsterEditForm from './MonsterEditForm.svelte';
  import EditorPanel from './EditorPanel.svelte';
  import { parseMonster as _parseMonster } from '../utils/schemaValidation';
  import { registerEditorGuard } from '../stores/navigationGuard';

  function parseMonster(json: string): Monster | null {
    try {
      const result = _parseMonster(JSON.parse(json));
      return result.ok ? result.data : null;
    } catch { return null; }
  }

  type Tab = 'karte' | 'bearbeiten' | 'json';
  let tab        = $state<Tab>('bearbeiten');
  let draft      = $state<Monster | null>(null);
  let dirty      = $state(false);
  let saveError  = $state('');
  let lastSavedContent = $state('');

  onMount(() => {
    async function load(path: string) {
      try {
        const content = await invoke<string>('read_file_content', { path });
        lastSavedContent = content;
        draft = structuredClone(parseMonster(content));
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
    const unguard = registerEditorGuard({
      isDirty: () => dirty,
      save,
      discard,
    });
    return () => { unsub(); unguard(); };
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
    draft = structuredClone(parseMonster(lastSavedContent));
    dirty = false;
    saveError = '';
  }

  async function saveJson(json: string) {
    const file = $activeFile;
    if (!file?.path) return;
    lastSavedContent = json;
    await invoke('write_file_content', { path: file.path, content: json });
    setFileContent(json);
    draft = parseMonster(json);
    dirty = false;
  }
</script>

<EditorPanel
  bind:tab
  {dirty}
  {saveError}
  onsave={save}
  ondiscard={discard}
  onsavejson={saveJson}
  getJson={() => draft ? JSON.stringify(draft, null, 2) : lastSavedContent}
  style="--ep-accent: var(--danger)"
>
  {#snippet karte()}
    {#if draft}
      <MonsterStatBlock monster={draft} />
    {:else}
      <p class="parse-error">
        Kein gültiger Monster-Datensatz.
        <button onclick={() => tab = 'json'}>JSON bearbeiten</button>
      </p>
    {/if}
  {/snippet}

  {#snippet bearbeiten()}
    {#if draft}
      <div class="stat-block">
        <MonsterEditForm bind:monster={draft} onchange={mark} />
      </div>
    {:else}
      <p class="parse-error">
        Ungültiges Monster-JSON.
        <button onclick={() => tab = 'json'}>JSON bearbeiten</button>
      </p>
    {/if}
  {/snippet}
</EditorPanel>

<style>
  .stat-block {
    background: var(--bg-raised);
    border: 1px solid var(--red);
    border-radius: 6px;
    padding: 1rem 1.25rem;
    max-width: 560px;
    width: 100%;
    font-size: 0.88rem;
    color: var(--ink);
  }

  .parse-error { color: var(--danger); font-size: 0.9rem; }
  .parse-error button {
    background: none; border: none; color: var(--red);
    cursor: pointer; text-decoration: underline; font-family: inherit;
  }
</style>
