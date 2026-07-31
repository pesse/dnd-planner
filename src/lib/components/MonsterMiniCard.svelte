<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import type { Monster } from '../types';
  import { monsterSizeLabel, monsterTypeLabel, monsterAlignmentLabel } from '../types';
  import { modStr } from '../domain/skills';
  import { normalizeMonster } from '../utils/schemaValidation';
  import { toActLocalJson, toLibraryJson } from '../utils/vaultJson';
  import { OWN_SOURCE } from '../schemas/source';
  import MonsterEditForm from './MonsterEditForm.svelte';

  let { slug, actMonsterBasePath }: { slug: string; actMonsterBasePath?: string } = $props();

  let status = $state<'loading' | 'ok' | 'missing'>('loading');
  let saved = $state<Monster | null>(null);
  let draft = $state<Monster | null>(null);
  let editMode = $state(false);
  let dirty = $state(false);
  let saveError = $state('');
  let source = $state<'global' | 'act'>('global');
  let savePath = $state('');
  let promoteError = $state('');

  const GLOBAL_MONSTERS_PATH = './vault/monsters';

  let loadError = $state('');
  let schemaWarnings = $state<string[]>([]);
  let loadSeq = 0;

  function validateMonster(m: unknown): string[] {
    const obj = m as Record<string, unknown>;
    const warns: string[] = [];
    if (!obj || typeof obj !== 'object') return ['Kein Objekt'];

    // ac
    if (typeof obj['ac'] !== 'object' || obj['ac'] === null || !('value' in (obj['ac'] as object)))
      warns.push('ac: erwartet { value, note }, gefunden: ' + JSON.stringify(obj['ac']));

    // hp
    if (typeof obj['hp'] !== 'object' || obj['hp'] === null || !('average' in (obj['hp'] as object)))
      warns.push('hp: erwartet { average, formula }, gefunden: ' + JSON.stringify(obj['hp']));

    // cr
    if (typeof obj['cr'] !== 'string')
      warns.push('cr: erwartet string, gefunden: ' + typeof obj['cr'] + ' (' + obj['cr'] + ')');

    // saving_throws vs saves
    if (!('saving_throws' in obj) && 'saves' in obj)
      warns.push('saving_throws fehlt — heißt das Feld "saves"?');

    // skills values should be strings
    if (obj['skills'] && typeof obj['skills'] === 'object') {
      const badSkills = Object.entries(obj['skills'] as Record<string, unknown>)
        .filter(([, v]) => typeof v !== 'string').map(([k]) => k);
      if (badSkills.length) warns.push('skills: Werte sollten Strings sein, nicht Zahlen (' + badSkills.join(', ') + ')');
    }

    return warns;
  }


  async function load(s: string, basePath: string | undefined) {
    const seq = ++loadSeq;
    status = 'loading';
    loadError = '';
    schemaWarnings = [];
    promoteError = '';

    // Akt-lokal zuerst
    if (basePath) {
      const actPath = `${basePath}/${s}.json`;
      try {
        const content = await invoke<string>('read_file_content', { path: actPath });
        if (seq !== loadSeq) return;
        const raw = JSON.parse(content);
        schemaWarnings = validateMonster(raw);
        const parsed = normalizeMonster(raw as Monster);
        saved = parsed;
        draft = structuredClone(parsed);
        savePath = actPath;
        source = 'act';
        status = 'ok';
        return;
      } catch { /* nicht akt-lokal vorhanden */ }
    }

    if (seq !== loadSeq) return;

    // Global fallback: Monster liegen entweder flach oder in Gruppen-Unterordnern
    // (z.B. vault/monsters/goblinoide/…). Erst flach, dann jede Gruppe durchsuchen.
    const tryPaths = [`${GLOBAL_MONSTERS_PATH}/${s}.json`];
    try {
      const entries = await invoke<{ name: string; is_dir: boolean }[]>('list_json_entries', { path: GLOBAL_MONSTERS_PATH });
      if (seq !== loadSeq) return;
      for (const e of entries) {
        if (e.is_dir) tryPaths.push(`${GLOBAL_MONSTERS_PATH}/${e.name}/${s}.json`);
      }
    } catch { /* Verzeichnisliste nicht verfügbar → nur flacher Pfad */ }

    for (const globalPath of tryPaths) {
      try {
        const content = await invoke<string>('read_file_content', { path: globalPath });
        if (seq !== loadSeq) return;
        const raw = JSON.parse(content);
        schemaWarnings = validateMonster(raw);
        const parsed = normalizeMonster(raw as Monster);
        saved = parsed;
        draft = structuredClone(parsed);
        savePath = globalPath;
        source = 'global';
        status = 'ok';
        return;
      } catch { /* nächsten Pfad versuchen */ }
    }

    if (seq !== loadSeq) return;
    loadError = 'nicht in Bibliothek gefunden';
    console.error(`MonsterMiniCard [${s}]: in vault/monsters (inkl. Untergruppen) nicht gefunden`);
    status = 'missing';
  }

  $effect(() => {
    const basePath = actMonsterBasePath; // explicit dep: re-run when path changes
    if (slug) load(slug, basePath);
  });

  // structuredClone cannot handle Svelte $state Proxies — use JSON round-trip instead
  function snap<T>(val: T): T { return JSON.parse(JSON.stringify(val)); }

  async function startEdit() {
    // Copy-on-write: globales Monster → erst akt-lokale Kopie anlegen
    if (source === 'global' && actMonsterBasePath && saved) {
      const actPath = `${actMonsterBasePath}/${slug}.json`;
      // Die Kopie ist akt-lokal — die Herkunft des Originals gilt für sie nicht mehr.
      const json = toActLocalJson(saved);
      try {
        await invoke('write_file_content', { path: actPath, content: json });
        savePath = actPath;
        source = 'act';
      } catch (e) {
        saveError = `Lokale Kopie konnte nicht angelegt werden: ${e}`;
        return;
      }
    }
    draft = snap(saved);
    dirty = false;
    editMode = true;
    saveError = '';
  }

  function cancelEdit() { draft = snap(saved); dirty = false; editMode = false; saveError = ''; }

  async function save() {
    if (!draft) return;
    try {
      const json = source === 'act' ? toActLocalJson(draft) : toLibraryJson(draft);
      await invoke('write_file_content', { path: savePath, content: json });
      saved = JSON.parse(json);
      dirty = false;
      saveError = '';
    } catch (e) {
      saveError = `${e}`;
    }
  }

  /** Sucht ein Monster in der globalen Bibliothek (flach + Gruppen-Unterordner). Liefert den Pfad oder null. */
  async function findGlobalPath(s: string): Promise<string | null> {
    const candidates = [`${GLOBAL_MONSTERS_PATH}/${s}.json`];
    try {
      const entries = await invoke<{ name: string; is_dir: boolean }[]>('list_json_entries', { path: GLOBAL_MONSTERS_PATH });
      for (const e of entries) if (e.is_dir) candidates.push(`${GLOBAL_MONSTERS_PATH}/${e.name}/${s}.json`);
    } catch { /* nur flacher Pfad prüfbar */ }
    for (const path of candidates) {
      try { await invoke<string>('read_file_content', { path }); return path; }
      catch { /* nicht hier */ }
    }
    return null;
  }

  async function promoteToLibrary() {
    if (source !== 'act') return;
    promoteError = '';
    // Guard: existiert der Slug bereits global (flach ODER in einer Gruppe),
    // würde rename_file ein Duplikat anlegen → abbrechen.
    const existing = await findGlobalPath(slug);
    if (existing) {
      promoteError = `„${slug}" existiert bereits in der Bibliothek (${existing}). Verschieben abgebrochen.`;
      return;
    }
    const globalPath = `${GLOBAL_MONSTERS_PATH}/${slug}.json`;
    try {
      await invoke('rename_file', { oldPath: savePath, newPath: globalPath });
      // In der Bibliothek gilt die Herkunftspflicht: ein übernommenes Monster ist
      // immer eigenes Material — auch wenn es als Kopie eines SRD-Monsters begann.
      const promoted = { ...saved, source: OWN_SOURCE } as Monster;
      await invoke('write_file_content', { path: globalPath, content: toLibraryJson(promoted) });
      saved = promoted;
      draft = snap(promoted);
      savePath = globalPath;
      source = 'global';
    } catch (e) {
      promoteError = `${e}`;
    }
  }

  function mark() { dirty = true; }

  const STAT_LABELS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;
  type StatKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  const STAT_KEYS: StatKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
</script>

<div class="mini-card" class:edit-mode={editMode} class:act-local={source === 'act'}>
  {#if status === 'loading'}
    <div class="mini-placeholder">…</div>

  {:else if status === 'missing'}
    <div class="mini-missing">
      <span class="missing-slug">{slug}</span>
      <span class="missing-note">{loadError || 'nicht in Bibliothek'}</span>
    </div>

  {:else if saved && draft}
    {#if editMode}
      <!-- ── Full edit view ── -->
      <div class="edit-header">
        <span class="source-badge source-{source}">{source === 'act' ? 'akt-lokal' : 'bibliothek'}</span>
        {#if dirty}
          <button class="save-btn" onclick={save}>Speichern</button>
          {#if saveError}<span class="save-error">{saveError}</span>{/if}
        {/if}
        <button class="cancel-btn" onclick={cancelEdit}>{dirty ? 'Verwerfen' : 'Schließen'}</button>
      </div>

      <div class="sb-full">
        <MonsterEditForm bind:monster={draft} onchange={mark} />
      </div>

    {:else}
      <!-- ── Compact read-only view ── -->
      <div class="compact">
        <div class="c-header">
          <span class="c-name">{saved.name}</span>
          <span class="c-cr">HG {saved.cr}</span>
          <span class="source-badge source-{source}">{source === 'act' ? 'akt' : ''}</span>
        </div>
        <div class="c-meta">{monsterSizeLabel(saved.size)} {monsterTypeLabel(saved.type)}</div>

        <div class="c-divider"></div>

        <div class="c-props">
          <span><span class="c-lbl">RK</span> {saved.ac.value}</span>
          <span><span class="c-lbl">TP</span> {saved.hp.average}</span>
          <span><span class="c-lbl">BW</span> {saved.speed}</span>
        </div>

        <div class="c-stats">
          {#each STAT_KEYS as key, i}
            <div class="c-stat">
              <span class="c-stat-lbl">{STAT_LABELS[i]}</span>
              <span class="c-stat-val">{saved.stats[key]}</span>
              <span class="c-stat-mod">{modStr(saved.stats[key])}</span>
            </div>
          {/each}
        </div>

        {#if saved.traits.length || saved.actions.length}
          <div class="c-divider"></div>
          <div class="c-abilities">
            {#each saved.traits as t}
              <span class="c-ability-name">{t.name}</span>
            {/each}
            {#each saved.actions as a}
              <span class="c-ability-name">{a.name}</span>
            {/each}
          </div>
        {/if}

        {#if schemaWarnings.length}
          <div class="schema-warning">
            <span class="schema-warn-icon">⚠ Schema-Fehler</span>
            <ul class="schema-warn-list">
              {#each schemaWarnings as w}<li>{w}</li>{/each}
            </ul>
          </div>
        {/if}

        <div class="c-action-row">
          <button class="edit-btn" onclick={startEdit}>
            {source === 'global' && actMonsterBasePath ? '✏ Lokal bearbeiten' : '✏ Bearbeiten'}
          </button>
          {#if source === 'act'}
            <button class="promote-btn" onclick={promoteToLibrary} title="In globale Bibliothek verschieben">→ Bibliothek</button>
          {/if}
        </div>
        {#if promoteError}<span class="promote-error">{promoteError}</span>{/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .mini-card {
    background: var(--bg-raised);
    border: 1px solid var(--red);
    border-radius: 6px;
    font-size: 0.82rem;
    color: var(--ink);
    width: 210px;
    flex-shrink: 0;
  }

  /* Akt-lokale Monster: heller Gold-Tint + goldener Rahmen (themekonform, statt
     die Textfarbe --ink als fast-schwarzen Hintergrund zu missbrauchen). */
  .mini-card.act-local {
    background: color-mix(in srgb, var(--gold) 10%, var(--bg-raised));
    border-color: var(--gold);
  }
  .mini-card.act-local .c-divider { background: color-mix(in srgb, var(--gold) 40%, transparent); }
  .mini-card.act-local .edit-header { background: color-mix(in srgb, var(--gold) 12%, var(--bg-deep)); border-bottom-color: var(--gold); }
  .mini-card.act-local .c-lbl { color: var(--gold); }
  .mini-card.act-local .c-name { color: var(--gold); }
  /* Formularfarben via CSS Custom Property — cascadiert in MonsterEditForm */
  .mini-card.act-local .sb-full {
    --mef-accent: var(--gold);
    --mef-dim: color-mix(in srgb, var(--gold) 27%, transparent);
  }

  .mini-card.edit-mode {
    width: 460px;
  }

  /* ── Loading / Missing ── */
  .mini-placeholder {
    padding: 0.5rem 0.75rem;
    color: var(--border);
    font-style: italic;
    font-size: 0.78rem;
  }

  .mini-missing {
    padding: 0.5rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .missing-slug {
    color: color-mix(in srgb, var(--danger) 53%, transparent);
    font-family: monospace;
    font-size: 0.78rem;
  }

  .missing-note {
    color: var(--border);
    font-size: 0.75rem;
    font-style: italic;
  }

  /* ── Compact view ── */
  .compact {
    padding: 0.6rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .c-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.3rem;
  }

  .c-name {
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--danger);
    font-variant: small-caps;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .c-cr {
    font-size: 0.72rem;
    color: var(--gold);
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .c-meta {
    font-size: 0.75rem;
    color: var(--ink-muted);
    font-style: italic;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .c-divider {
    height: 1px;
    background: color-mix(in srgb, var(--red) 33%, transparent);
    margin: 0.15rem 0;
  }

  .c-props {
    display: flex;
    gap: 0.5rem;
    font-size: 0.78rem;
    flex-wrap: wrap;
  }

  .c-lbl {
    font-weight: 700;
    color: var(--danger);
  }

  .c-stats {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    text-align: center;
    gap: 0.1rem;
  }

  .c-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.02rem;
  }

  .c-stat-lbl { font-size: 0.62rem; color: var(--danger); font-weight: 700; text-transform: uppercase; }
  .c-stat-val { font-size: 0.82rem; font-weight: 600; }
  .c-stat-mod { font-size: 0.65rem; color: var(--ink-soft); }

  .c-abilities {
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
  }

  .c-ability-name {
    font-size: 0.75rem;
    color: var(--ink-soft);
    font-style: italic;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .c-action-row {
    display: flex;
    gap: 0.3rem;
    align-items: center;
    margin-top: 0.25rem;
    flex-wrap: wrap;
  }

  .edit-btn {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--ink-muted);
    border-radius: 4px;
    padding: 0.2rem 0.5rem;
    cursor: pointer;
    font-size: 0.75rem;
  }
  .edit-btn:hover { border-color: var(--danger); color: var(--danger); }

  .promote-btn {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--ink-muted);
    border-radius: 4px;
    padding: 0.2rem 0.5rem;
    cursor: pointer;
    font-size: 0.72rem;
  }
  .promote-btn:hover { border-color: var(--green); color: var(--green); }

  .promote-error {
    font-size: 0.72rem;
    color: var(--danger);
  }

  .schema-warning {
    background: color-mix(in srgb, var(--gold) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--gold) 33%, transparent);
    border-radius: 3px;
    padding: 0.3rem 0.4rem;
    font-size: 0.72rem;
  }
  .schema-warn-icon { font-weight: 700; color: var(--gold); }
  .schema-warn-list { margin: 0.2rem 0 0; padding-left: 1rem; color: color-mix(in srgb, var(--gold) 60%, transparent); line-height: 1.5; }
  .schema-warn-list li { margin: 0; }

  .source-badge {
    font-size: 0.62rem;
    font-weight: 700;
    padding: 0.05rem 0.3rem;
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    flex-shrink: 0;
  }
  .source-act {
    background: color-mix(in srgb, var(--gold) 15%, transparent);
    color: var(--gold);
    border: 1px solid color-mix(in srgb, var(--gold) 27%, transparent);
  }
  /* global badge ist unsichtbar in compact view (leerer Text) */
  .source-global { display: none; }

  /* ── Edit view ── */
  .edit-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.75rem;
    background: var(--bg-deep);
    border-bottom: 1px solid var(--red);
    flex-wrap: wrap;
  }

  .save-error { color: var(--danger); font-size: 0.75rem; flex: 1; }

  .save-btn {
    background: var(--green);
    color: var(--bg);
    border: none;
    border-radius: 4px;
    padding: 0.2rem 0.6rem;
    cursor: pointer;
    font-size: 0.78rem;
    font-weight: 600;
  }

  .cancel-btn {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--ink-muted);
    border-radius: 4px;
    padding: 0.2rem 0.6rem;
    cursor: pointer;
    font-size: 0.78rem;
  }

  .sb-full {
    padding: 0.6rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    overflow-y: auto;
    max-height: calc(100vh - 160px);
  }

</style>
