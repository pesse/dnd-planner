<script lang="ts">
  import { fileContent, activeFile, setFileContent } from '../stores/campaign';
  import { invoke } from '@tauri-apps/api/core';
  import type { Encounter, EncounterMonster } from '../types';
  import MonsterMiniCard from './MonsterMiniCard.svelte';

  function parseEncounter(json: string): Encounter | null {
    try {
      const obj = JSON.parse(json);
      if (!obj || typeof obj !== 'object' || !('monsters' in obj) || !('difficulty' in obj)) return null;
      obj.monsters ??= []; obj.tags ??= [];
      return obj as Encounter;
    } catch { return null; }
  }

  const DIFFICULTY_COLOR: Record<string, string> = {
    leicht: '#a6e3a1',
    mittel: '#f9e2af',
    schwer: '#fab387',
    tödlich: '#f38ba8',
  };

  function diffColor(d: string): string {
    return DIFFICULTY_COLOR[d] ?? '#a6adc8';
  }

  let draft = $state<Encounter | null>(null);
  let dirty = $state(false);
  let saveError = $state('');
  let showJson = $state(false);
  let rawJson = $state('');
  let jsonError = $state('');
  let lastSavedContent = $state('');

  $effect(() => {
    const content = $fileContent;
    if (content !== lastSavedContent) {
      const parsed = parseEncounter(content);
      draft = parsed ? structuredClone(parsed) : null;
      dirty = false;
      saveError = '';
      lastSavedContent = content;
    }
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
    const parsed = parseEncounter($fileContent);
    draft = parsed ? structuredClone(parsed) : null;
    dirty = false;
    saveError = '';
  }

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

  function addMonster() {
    draft!.monsters.push({ slug: '', count: 1, notes: '' });
    mark();
  }

  function removeMonster(i: number) {
    draft!.monsters.splice(i, 1);
    mark();
  }
</script>

<div class="encounter-panel">
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
    <div class="enc-layout">
    <div class="enc-main-col">
    {#if dirty}
      <div class="save-bar">
        {#if saveError}<span class="save-error">{saveError}</span>{/if}
        <button class="save-btn" onclick={save}>Speichern</button>
        <button class="cancel-btn" onclick={discard}>Verwerfen</button>
      </div>
    {/if}

    <div class="enc-card">
      <!-- Header -->
      <div class="enc-header">
        <input
          class="editable-field enc-name-input"
          bind:value={draft.name}
          oninput={mark}
          placeholder="Encounter-Name"
        />
        <select
          class="editable-field diff-select"
          bind:value={draft.difficulty}
          onchange={mark}
          style="color: {diffColor(draft.difficulty)}"
        >
          <option value="leicht">LEICHT</option>
          <option value="mittel">MITTEL</option>
          <option value="schwer">SCHWER</option>
          <option value="tödlich">TÖDLICH</option>
        </select>
      </div>

      <textarea
        class="editable-field enc-desc-input"
        bind:value={draft.description}
        oninput={mark}
        placeholder="Beschreibung…"
        rows="2"
      ></textarea>

      <!-- Meta -->
      <div class="enc-meta">
        <div class="enc-meta-item">
          <span class="meta-label">Ort</span>
          <input class="editable-field meta-input" bind:value={draft.location} oninput={mark} placeholder="—" />
        </div>
        <div class="enc-meta-item">
          <span class="meta-label">Gruppe</span>
          <input class="editable-field meta-num-input" type="number" bind:value={draft.party_size} oninput={mark} />
          <span class="meta-sep">× Lvl</span>
          <input class="editable-field meta-num-input" type="number" bind:value={draft.party_level} oninput={mark} />
        </div>
        <div class="enc-meta-item">
          <span class="meta-label">Gesamt-EP</span>
          <input class="editable-field meta-num-input meta-xp" type="number" bind:value={draft.xp_total} oninput={mark} />
          <span class="meta-sep">XP</span>
        </div>
      </div>

      <div class="enc-divider"></div>

      <!-- Monster list -->
      <h3 class="enc-section-title">Monster</h3>
      <div class="enc-monster-list">
        {#each draft.monsters as m, i}
          <div class="enc-monster-row">
            <input class="editable-field mon-count-input" type="number" bind:value={m.count} oninput={mark} min="1" />
            <span class="mon-sep">×</span>
            <input class="editable-field mon-slug-input" bind:value={m.slug} oninput={mark} placeholder="monster-slug" />
            <input class="editable-field mon-notes-input" bind:value={m.notes} oninput={mark} placeholder="Notizen…" />
            <button class="row-remove" onclick={() => removeMonster(i)}>×</button>
          </div>
        {/each}
        <button class="add-row-btn" onclick={addMonster}>+ Monster</button>
      </div>

      <div class="enc-divider"></div>

      <!-- Loot -->
      <h3 class="enc-section-title">Beute</h3>
      <textarea
        class="editable-field enc-text-input"
        bind:value={draft.loot}
        oninput={mark}
        placeholder="Beute…"
        rows="2"
      ></textarea>

      <div class="enc-divider"></div>

      <!-- Notes -->
      <h3 class="enc-section-title">Notizen</h3>
      <textarea
        class="editable-field enc-text-input enc-notes-input"
        bind:value={draft.notes}
        oninput={mark}
        placeholder="Notizen…"
        rows="4"
      ></textarea>

      <div class="enc-divider"></div>

      <!-- Tags -->
      <div class="enc-tags-row">
        <span class="meta-label">Tags</span>
        <input
          class="editable-field tags-input"
          value={draft.tags.join(', ')}
          oninput={(e) => { draft!.tags = e.currentTarget.value.split(',').map(s => s.trim()).filter(Boolean); mark(); }}
          placeholder="tag1, tag2"
        />
      </div>

      <div class="enc-footer">
        <button class="json-btn" onclick={openJson}>JSON</button>
      </div>
    </div>
    </div><!-- enc-main-col -->

    <!-- Monster mini cards -->
    {#if draft.monsters.some(m => m.slug)}
      <div class="enc-monsters-col">
        {#each draft.monsters.filter(m => m.slug) as m}
          <div class="mini-card-wrap">
            {#if m.count > 1}
              <div class="mini-count-badge">{m.count}×</div>
            {/if}
            <MonsterMiniCard slug={m.slug} />
          </div>
        {/each}
      </div>
    {/if}

    </div><!-- enc-layout -->
  {:else}
    <div class="parse-error">Ungültiges Encounter-JSON. <button onclick={openJson}>JSON bearbeiten</button></div>
  {/if}
</div>

<style>
  .encounter-panel {
    flex: 1;
    overflow: auto;
    padding: 1.5rem;
    background: #1e1e2e;
  }

  .enc-layout {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: 1rem;
    min-width: max-content;
  }

  .enc-main-col {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: 620px;
    flex-shrink: 0;
  }

  .enc-monsters-col {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
    flex-shrink: 0;
  }

  .mini-card-wrap {
    position: relative;
  }

  .mini-count-badge {
    position: absolute;
    top: -0.4rem;
    left: -0.4rem;
    background: #f9e2af;
    color: #1e1e2e;
    font-size: 0.68rem;
    font-weight: 700;
    border-radius: 10px;
    padding: 0.05rem 0.3rem;
    z-index: 1;
    line-height: 1.4;
  }

  .save-bar {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    background: #1f2a35;
    border: 1px solid #3a5a6b;
    border-radius: 4px;
    padding: 0.4rem 0.75rem;
    width: 100%;
    max-width: 620px;
  }

  .save-error { flex: 1; color: #f38ba8; font-size: 0.8rem; }

  .enc-card {
    background: #1f2a35;
    border: 1px solid #3a5a6b;
    border-radius: 6px;
    padding: 1.25rem;
    max-width: 620px;
    width: 100%;
    color: #cdd6f4;
    font-size: 0.88rem;
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
    border-color: #3a5a6b;
    background: #1a2530;
  }

  .editable-field:focus {
    border-color: #89dceb;
    background: #1a2530;
  }

  /* ── Header ── */
  .enc-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
    flex-wrap: wrap;
  }

  .enc-name-input {
    font-size: 1.25rem;
    font-weight: 700;
    color: #89dceb;
    font-variant: small-caps;
    flex: 1;
    min-width: 120px;
  }

  .diff-select {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    background: transparent;
    cursor: pointer;
    padding: 0.1rem 0.3rem;
  }

  .diff-select option { background: #1e1e2e; color: #cdd6f4; }

  .enc-desc-input {
    width: 100%;
    color: #a6adc8;
    font-style: italic;
    resize: vertical;
    line-height: 1.6;
    font-size: 0.85rem;
    margin-bottom: 0.75rem;
  }

  /* ── Meta ── */
  .enc-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    font-size: 0.82rem;
  }

  .enc-meta-item {
    display: flex;
    align-items: baseline;
    gap: 0.2rem;
  }

  .meta-label { font-weight: 700; color: #89dceb; white-space: nowrap; }
  .meta-sep { color: #a6adc8; }

  .meta-input { min-width: 80px; flex: 1; }
  .meta-num-input { width: 44px; text-align: center; }
  .meta-xp { width: 60px; }

  /* ── Divider ── */
  .enc-divider {
    height: 1px;
    background: #3a5a6b;
    margin: 0.75rem 0;
  }

  .enc-section-title {
    font-size: 0.82rem;
    font-weight: 700;
    color: #89dceb;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin: 0 0 0.4rem;
  }

  /* ── Monster list ── */
  .enc-monster-list {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .enc-monster-row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .mon-sep { color: #f9e2af; font-weight: 700; }
  .mon-count-input { width: 44px; text-align: center; font-weight: 700; color: #f9e2af; }
  .mon-slug-input { width: 180px; font-weight: 600; }
  .mon-notes-input { flex: 1; color: #6c7086; font-style: italic; font-size: 0.82rem; }

  .row-remove {
    background: none;
    border: none;
    color: #45475a;
    cursor: pointer;
    font-size: 1rem;
    padding: 0 0.2rem;
    flex-shrink: 0;
  }
  .row-remove:hover { color: #f38ba8; }

  .add-row-btn {
    background: none;
    border: 1px dashed #3a5a6b;
    color: #6c7086;
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0.15rem 0.5rem;
    border-radius: 3px;
    align-self: flex-start;
  }
  .add-row-btn:hover { border-color: #89dceb; color: #89dceb; }

  /* ── Text areas ── */
  .enc-text-input {
    width: 100%;
    resize: vertical;
    line-height: 1.6;
    color: #a6adc8;
  }

  .enc-notes-input { white-space: pre-wrap; font-size: 0.82rem; }

  /* ── Tags ── */
  .enc-tags-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .tags-input { flex: 1; }

  /* ── Footer ── */
  .enc-footer {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.75rem;
    padding-top: 0.5rem;
    border-top: 1px solid #3a5a6b33;
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
  .save-btn { background: #a6e3a1; color: #1e1e2e; border: none; border-radius: 4px; padding: 0.25rem 0.75rem; cursor: pointer; font-size: 0.82rem; font-weight: 600; }
  .cancel-btn { background: transparent; border: 1px solid #45475a; color: #6c7086; border-radius: 4px; padding: 0.25rem 0.75rem; cursor: pointer; font-size: 0.82rem; }
  .json-textarea { flex: 1; min-height: 500px; background: #181825; border: 1px solid #313244; border-radius: 4px; color: #cdd6f4; font-family: 'JetBrains Mono', monospace; font-size: 0.82rem; padding: 1rem; outline: none; resize: vertical; line-height: 1.6; }

  .parse-error { color: #f38ba8; font-size: 0.9rem; }
  .parse-error button { background: none; border: none; color: #89b4fa; cursor: pointer; text-decoration: underline; }
</style>
