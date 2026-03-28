<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import type { Monster, MonsterAction } from '../types';

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

  function normalizeMonster(m: Monster): Monster {
    m.traits ??= []; m.actions ??= []; m.reactions ??= []; m.legendary_actions ??= [];
    m.tags ??= []; m.damage_resistances ??= []; m.damage_immunities ??= [];
    m.condition_immunities ??= []; m.saving_throws ??= {}; m.skills ??= {};
    return m;
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

    // Global fallback
    const globalPath = `${GLOBAL_MONSTERS_PATH}/${s}.json`;
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
    } catch (e) {
      if (seq !== loadSeq) return;
      loadError = String(e);
      console.error(`MonsterMiniCard [${s}]:`, e);
      status = 'missing';
    }
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
      const json = JSON.stringify(saved, null, 2);
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
      const json = JSON.stringify(draft, null, 2);
      await invoke('write_file_content', { path: savePath, content: json });
      saved = JSON.parse(json);
      dirty = false;
      saveError = '';
    } catch (e) {
      saveError = `${e}`;
    }
  }

  async function promoteToLibrary() {
    if (source !== 'act') return;
    promoteError = '';
    const globalPath = `${GLOBAL_MONSTERS_PATH}/${slug}.json`;
    try {
      await invoke('rename_file', { oldPath: savePath, newPath: globalPath });
      savePath = globalPath;
      source = 'global';
    } catch (e) {
      promoteError = `${e}`;
    }
  }

  function mark() { dirty = true; }

  function mod(n: number): string {
    const m = Math.floor((n - 10) / 2);
    return m >= 0 ? `+${m}` : `${m}`;
  }

  type StatKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  const STAT_KEYS: StatKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  const STAT_LABELS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

  function kvKeys(obj: Record<string, string>) { return Object.keys(obj); }
  function addKv(obj: Record<string, string>) { obj[`neu_${Date.now()}`] = ''; mark(); }
  function removeKv(obj: Record<string, string>, key: string) { delete obj[key]; mark(); }
  function renameKv(obj: Record<string, string>, oldKey: string, newKey: string) {
    if (oldKey === newKey || newKey in obj) return;
    const val = obj[oldKey];
    const entries = Object.entries(obj);
    const idx = entries.findIndex(([k]) => k === oldKey);
    entries[idx] = [newKey, val];
    for (const k of Object.keys(obj)) delete obj[k];
    for (const [k, v] of entries) obj[k] = v;
    mark();
  }
  function addAction(arr: MonsterAction[]) { arr.push({ name: 'Neu', description: '' }); mark(); }
  function removeAction(arr: MonsterAction[], i: number) { arr.splice(i, 1); mark(); }
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
        <!-- Name / meta -->
        <input class="ef sb-name-input" bind:value={draft.name} oninput={mark} placeholder="Name" />
        <div class="meta-row">
          <input class="ef meta-in" bind:value={draft.size} oninput={mark} placeholder="Größe" />
          <input class="ef meta-in" bind:value={draft.type} oninput={mark} placeholder="Typ" />
          <span class="sep">,</span>
          <input class="ef meta-in" bind:value={draft.alignment} oninput={mark} placeholder="Gesinnung" />
        </div>

        <div class="divider"></div>

        <!-- AC / HP / Speed -->
        <div class="prop-row"><span class="lbl">RK</span>
          <input class="ef num-in" type="number" bind:value={draft.ac.value} oninput={mark} />
          <input class="ef note-in" bind:value={draft.ac.note} oninput={mark} placeholder="(Notiz)" />
        </div>
        <div class="prop-row"><span class="lbl">TP</span>
          <input class="ef num-in" type="number" bind:value={draft.hp.average} oninput={mark} />
          <input class="ef note-in" bind:value={draft.hp.formula} oninput={mark} placeholder="Formel" />
        </div>
        <div class="prop-row"><span class="lbl">BW</span>
          <input class="ef wide-in" bind:value={draft.speed} oninput={mark} />
        </div>

        <div class="divider"></div>

        <!-- Stats -->
        <div class="stats-grid">
          {#each STAT_KEYS as key, i}
            <div class="stat-cell">
              <span class="stat-lbl">{STAT_LABELS[i]}</span>
              <input class="ef stat-in" type="number" bind:value={draft.stats[key]} oninput={mark} />
              <span class="stat-mod">({mod(draft.stats[key])})</span>
            </div>
          {/each}
        </div>

        <div class="divider"></div>

        <!-- KV fields -->
        <div class="kv-row"><span class="lbl">Rettung</span>
          <div class="kv-list">
            {#each kvKeys(draft.saving_throws) as key}
              <span class="kv-pair">
                <input class="ef kv-key" value={key} onblur={(e) => renameKv(draft!.saving_throws, key, e.currentTarget.value)} />
                <input class="ef kv-val" bind:value={draft.saving_throws[key]} oninput={mark} />
                <button class="kv-del" onclick={() => removeKv(draft!.saving_throws, key)}>×</button>
              </span>
            {/each}
            <button class="kv-add" onclick={() => addKv(draft!.saving_throws)}>+</button>
          </div>
        </div>
        <div class="kv-row"><span class="lbl">Fertigk.</span>
          <div class="kv-list">
            {#each kvKeys(draft.skills) as key}
              <span class="kv-pair">
                <input class="ef kv-key" value={key} onblur={(e) => renameKv(draft!.skills, key, e.currentTarget.value)} />
                <input class="ef kv-val" bind:value={draft.skills[key]} oninput={mark} />
                <button class="kv-del" onclick={() => removeKv(draft!.skills, key)}>×</button>
              </span>
            {/each}
            <button class="kv-add" onclick={() => addKv(draft!.skills)}>+</button>
          </div>
        </div>

        <div class="prop-row"><span class="lbl">Resistenzen</span>
          <input class="ef wide-in" value={draft.damage_resistances.join(', ')}
            oninput={(e) => { draft!.damage_resistances = e.currentTarget.value.split(',').map(s => s.trim()).filter(Boolean); mark(); }} />
        </div>
        <div class="prop-row"><span class="lbl">Immun.</span>
          <input class="ef wide-in" value={draft.damage_immunities.join(', ')}
            oninput={(e) => { draft!.damage_immunities = e.currentTarget.value.split(',').map(s => s.trim()).filter(Boolean); mark(); }} />
        </div>
        <div class="prop-row"><span class="lbl">Sinne</span>
          <input class="ef wide-in" bind:value={draft.senses} oninput={mark} />
        </div>
        <div class="prop-row"><span class="lbl">Sprachen</span>
          <input class="ef wide-in" bind:value={draft.languages} oninput={mark} />
        </div>
        <div class="prop-row"><span class="lbl">HG</span>
          <input class="ef cr-in" bind:value={draft.cr} oninput={mark} />
          <span class="sep">(</span>
          <input class="ef num-in" type="number" bind:value={draft.xp} oninput={mark} />
          <span class="sep"> EP)</span>
        </div>

        <!-- Traits -->
        {#if draft.traits.length || true}
          <div class="divider"></div>
          <div class="action-list">
            {#each draft.traits as t, i}
              <div class="action-block">
                <div class="action-hdr">
                  <input class="ef action-name-in" bind:value={t.name} oninput={mark} />
                  <button class="act-del" onclick={() => removeAction(draft!.traits, i)}>×</button>
                </div>
                <textarea class="ef action-desc-ta" bind:value={t.description} oninput={mark} rows="2"></textarea>
              </div>
            {/each}
            <button class="add-action-btn" onclick={() => addAction(draft!.traits)}>+ Eigenschaft</button>
          </div>
        {/if}

        <!-- Actions -->
        <div class="divider"></div>
        <h4 class="section-title">Aktionen</h4>
        <div class="action-list">
          {#each draft.actions as a, i}
            <div class="action-block">
              <div class="action-hdr">
                <input class="ef action-name-in" bind:value={a.name} oninput={mark} />
                <button class="act-del" onclick={() => removeAction(draft!.actions, i)}>×</button>
              </div>
              <div class="action-attack-row">
                <span class="lbl-sm">Bonus</span>
                <input class="ef num-in-sm" type="number"
                  value={a.attack_bonus ?? ''}
                  oninput={(e) => { a.attack_bonus = e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value); mark(); }} />
                <span class="lbl-sm">Schaden</span>
                <input class="ef wide-in-sm" bind:value={a.damage} oninput={mark} />
              </div>
              <textarea class="ef action-desc-ta" bind:value={a.description} oninput={mark} rows="2"></textarea>
            </div>
          {/each}
          <button class="add-action-btn" onclick={() => addAction(draft!.actions)}>+ Aktion</button>
        </div>

        <!-- Reactions -->
        {#if draft.reactions.length || true}
          <div class="divider"></div>
          <h4 class="section-title">Reaktionen</h4>
          <div class="action-list">
            {#each draft.reactions as r, i}
              <div class="action-block">
                <div class="action-hdr">
                  <input class="ef action-name-in" bind:value={r.name} oninput={mark} />
                  <button class="act-del" onclick={() => removeAction(draft!.reactions, i)}>×</button>
                </div>
                <textarea class="ef action-desc-ta" bind:value={r.description} oninput={mark} rows="2"></textarea>
              </div>
            {/each}
            <button class="add-action-btn" onclick={() => addAction(draft!.reactions)}>+ Reaktion</button>
          </div>
        {/if}

        <!-- Legendary -->
        {#if draft.legendary_actions.length || true}
          <div class="divider"></div>
          <h4 class="section-title">Legendäre Aktionen</h4>
          <div class="action-list">
            {#each draft.legendary_actions as la, i}
              <div class="action-block">
                <div class="action-hdr">
                  <input class="ef action-name-in" bind:value={la.name} oninput={mark} />
                  <button class="act-del" onclick={() => removeAction(draft!.legendary_actions, i)}>×</button>
                </div>
                <textarea class="ef action-desc-ta" bind:value={la.description} oninput={mark} rows="2"></textarea>
              </div>
            {/each}
            <button class="add-action-btn" onclick={() => addAction(draft!.legendary_actions)}>+ Legendäre Aktion</button>
          </div>
        {/if}

        <!-- Tags -->
        <div class="divider"></div>
        <div class="prop-row"><span class="lbl">Tags</span>
          <input class="ef wide-in" value={draft.tags.join(', ')}
            oninput={(e) => { draft!.tags = e.currentTarget.value.split(',').map(s => s.trim()).filter(Boolean); mark(); }} />
        </div>
      </div>

    {:else}
      <!-- ── Compact read-only view ── -->
      <div class="compact">
        <div class="c-header">
          <span class="c-name">{saved.name}</span>
          <span class="c-cr">HG {saved.cr}</span>
          <span class="source-badge source-{source}">{source === 'act' ? 'akt' : ''}</span>
        </div>
        <div class="c-meta">{saved.size} {saved.type}</div>

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
              <span class="c-stat-mod">{mod(saved.stats[key])}</span>
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
    background: #2a1f35;
    border: 1px solid #6b3a3a;
    border-radius: 6px;
    font-size: 0.82rem;
    color: #cdd6f4;
    width: 210px;
    flex-shrink: 0;
  }

  /* Akt-lokale Monster: amber statt rot */
  .mini-card.act-local {
    background: #241e10;
    border-color: #7a5c1a;
  }
  .mini-card.act-local .c-divider,
  .mini-card.act-local .divider { background: #7a5c1a44; }
  .mini-card.act-local .edit-header { background: #1a1508; border-bottom-color: #7a5c1a; }
  .mini-card.act-local .c-lbl,
  .mini-card.act-local .lbl,
  .mini-card.act-local .c-stat-lbl,
  .mini-card.act-local .stat-lbl,
  .mini-card.act-local .section-title { color: #f9e2af; }
  .mini-card.act-local .c-name,
  .mini-card.act-local .sb-name-input { color: #f9e2af; }
  .mini-card.act-local .ef:hover,
  .mini-card.act-local .ef:focus { border-color: #f9e2af; background: #1a1508; }
  .mini-card.act-local .action-block { border-left-color: #7a5c1a44; }
  .mini-card.act-local .section-title { border-bottom-color: #7a5c1a44; }

  .mini-card.edit-mode {
    width: 460px;
  }

  /* ── Loading / Missing ── */
  .mini-placeholder {
    padding: 0.5rem 0.75rem;
    color: #45475a;
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
    color: #f38ba888;
    font-family: monospace;
    font-size: 0.78rem;
  }

  .missing-note {
    color: #45475a;
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
    color: #f38ba8;
    font-variant: small-caps;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .c-cr {
    font-size: 0.72rem;
    color: #f9e2af;
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .c-meta {
    font-size: 0.75rem;
    color: #6c7086;
    font-style: italic;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .c-divider {
    height: 1px;
    background: #6b3a3a55;
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
    color: #f38ba8;
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

  .c-stat-lbl { font-size: 0.62rem; color: #f38ba8; font-weight: 700; text-transform: uppercase; }
  .c-stat-val { font-size: 0.82rem; font-weight: 600; }
  .c-stat-mod { font-size: 0.65rem; color: #a6adc8; }

  .c-abilities {
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
  }

  .c-ability-name {
    font-size: 0.75rem;
    color: #a6adc8;
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
    border: 1px solid #45475a;
    color: #6c7086;
    border-radius: 4px;
    padding: 0.2rem 0.5rem;
    cursor: pointer;
    font-size: 0.75rem;
  }
  .edit-btn:hover { border-color: #f38ba8; color: #f38ba8; }

  .promote-btn {
    background: transparent;
    border: 1px solid #45475a;
    color: #6c7086;
    border-radius: 4px;
    padding: 0.2rem 0.5rem;
    cursor: pointer;
    font-size: 0.72rem;
  }
  .promote-btn:hover { border-color: #a6e3a1; color: #a6e3a1; }

  .promote-error {
    font-size: 0.72rem;
    color: #f38ba8;
  }

  .schema-warning {
    background: color-mix(in srgb, #f9e2af 10%, transparent);
    border: 1px solid #f9e2af55;
    border-radius: 3px;
    padding: 0.3rem 0.4rem;
    font-size: 0.72rem;
  }
  .schema-warn-icon { font-weight: 700; color: #f9e2af; }
  .schema-warn-list { margin: 0.2rem 0 0; padding-left: 1rem; color: #f9e2af99; line-height: 1.5; }
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
    background: color-mix(in srgb, #f9e2af 15%, transparent);
    color: #f9e2af;
    border: 1px solid #f9e2af44;
  }
  /* global badge ist unsichtbar in compact view (leerer Text) */
  .source-global { display: none; }

  /* ── Edit view ── */
  .edit-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.75rem;
    background: #1a1020;
    border-bottom: 1px solid #6b3a3a;
    flex-wrap: wrap;
  }

  .save-error { color: #f38ba8; font-size: 0.75rem; flex: 1; }

  .save-btn {
    background: #a6e3a1;
    color: #1e1e2e;
    border: none;
    border-radius: 4px;
    padding: 0.2rem 0.6rem;
    cursor: pointer;
    font-size: 0.78rem;
    font-weight: 600;
  }

  .cancel-btn {
    background: transparent;
    border: 1px solid #45475a;
    color: #6c7086;
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

  /* ── Editable field ── */
  .ef {
    background: transparent;
    border: 1px solid transparent;
    color: inherit;
    font: inherit;
    padding: 0.08rem 0.2rem;
    border-radius: 3px;
    outline: none;
    transition: border-color 0.1s, background 0.1s;
  }
  .ef:hover { border-color: #45475a; background: #1a1020; }
  .ef:focus { border-color: #f38ba8; background: #1a1020; }

  .sb-name-input {
    font-size: 1.1rem;
    font-weight: 700;
    color: #f38ba8;
    font-variant: small-caps;
    width: 100%;
  }

  .meta-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.1rem;
    font-style: italic;
    color: #a6adc8;
    font-size: 0.8rem;
  }

  .meta-in { font-style: italic; color: #a6adc8; font-size: 0.8rem; min-width: 50px; }
  .sep { color: #6c7086; padding: 0 0.05rem; }

  .divider { height: 1px; background: #6b3a3a55; margin: 0.3rem 0; }

  .prop-row { display: flex; align-items: baseline; flex-wrap: wrap; gap: 0.2rem; line-height: 1.7; }
  .lbl { font-weight: 700; color: #f38ba8; white-space: nowrap; font-size: 0.78rem; }
  .lbl-sm { font-weight: 700; color: #f38ba866; font-size: 0.72rem; white-space: nowrap; }

  .num-in { width: 48px; text-align: center; }
  .num-in-sm { width: 40px; text-align: center; font-size: 0.78rem; }
  .note-in { min-width: 60px; color: #a6adc8; font-style: italic; }
  .wide-in { flex: 1; min-width: 80px; }
  .wide-in-sm { flex: 1; min-width: 60px; font-size: 0.78rem; }
  .cr-in { width: 36px; text-align: center; }

  /* Stats */
  .stats-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 0.2rem; text-align: center; }
  .stat-cell { display: flex; flex-direction: column; align-items: center; gap: 0.02rem; }
  .stat-lbl { font-size: 0.62rem; font-weight: 700; color: #f38ba8; text-transform: uppercase; }
  .stat-in { width: 38px; text-align: center; font-size: 0.88rem; font-weight: 600; padding: 0.05rem; }
  .stat-mod { font-size: 0.65rem; color: #a6adc8; }

  /* KV */
  .kv-row { display: flex; align-items: flex-start; gap: 0.3rem; flex-wrap: wrap; line-height: 1.7; }
  .kv-list { display: flex; flex-wrap: wrap; gap: 0.15rem; align-items: center; }
  .kv-pair { display: flex; align-items: center; gap: 0.05rem; }
  .kv-key { width: 72px; font-size: 0.78rem; }
  .kv-val { width: 38px; font-size: 0.78rem; color: #a6e3a1; }
  .kv-del { background: none; border: none; color: #45475a; cursor: pointer; padding: 0 0.15rem; line-height: 1; }
  .kv-del:hover { color: #f38ba8; }
  .kv-add { background: none; border: 1px dashed #45475a; color: #6c7086; cursor: pointer; font-size: 0.72rem; padding: 0.02rem 0.3rem; border-radius: 3px; }
  .kv-add:hover { border-color: #f38ba8; color: #f38ba8; }

  /* Actions */
  .section-title { font-size: 0.78rem; font-weight: 700; color: #f38ba8; font-variant: small-caps; margin: 0.2rem 0 0.1rem; border-bottom: 1px solid #6b3a3a55; padding-bottom: 0.1rem; }
  .action-list { display: flex; flex-direction: column; gap: 0.35rem; }
  .action-block { border-left: 2px solid #6b3a3a44; padding-left: 0.4rem; display: flex; flex-direction: column; gap: 0.1rem; }
  .action-hdr { display: flex; align-items: center; gap: 0.2rem; }
  .action-name-in { flex: 1; font-weight: 700; font-style: italic; min-width: 0; }
  .action-attack-row { display: flex; align-items: center; gap: 0.2rem; flex-wrap: wrap; }
  .action-desc-ta { width: 100%; resize: vertical; line-height: 1.4; font-size: 0.78rem; min-height: 2rem; }
  .act-del { background: none; border: none; color: #45475a; cursor: pointer; font-size: 0.9rem; padding: 0 0.15rem; flex-shrink: 0; }
  .act-del:hover { color: #f38ba8; }
  .add-action-btn { background: none; border: 1px dashed #45475a; color: #6c7086; cursor: pointer; font-size: 0.72rem; padding: 0.1rem 0.4rem; border-radius: 3px; align-self: flex-start; }
  .add-action-btn:hover { border-color: #f38ba8; color: #f38ba8; }
</style>
