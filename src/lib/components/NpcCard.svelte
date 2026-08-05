<script lang="ts">
  import { SKILL_DEFS, mod, modStr } from '../domain/skills';
  import { ABILITY_ABBR_DE, ABILITY_KEYS } from '../schemas/abilities';
  import { sign } from '../utils/num';
  import { createCardEditor } from '../editor/cardEditor.svelte';
  import { normalizeNpc } from '../utils/schemaValidation';
  import type { Npc, NpcStats } from '../schemas/npc';
  import NpcSpellSection from './npc/NpcSpellSection.svelte';
  import NpcInventorySection from './npc/NpcInventorySection.svelte';
  import './npc/npcCard.css';

  function parseNpc(json: string): Npc | null {
    try {
      const raw = JSON.parse(json);
      if (!raw || typeof raw !== 'object') return null;
      return normalizeNpc(raw);
    } catch { return null; }
  }

  const ed = createCardEditor<Npc>({ type: 'npc', label: 'NPC', parse: parseNpc });
  const draft = $derived(ed.draft);

  /**
   * Der Bogen hat keine Speichern-Leiste — er schreibt 600 ms nach der letzten
   * Änderung selbst. Der Guard deckt genau dieses Fenster ab.
   */
  const draftJson = $derived(draft ? JSON.stringify(draft) : '');
  $effect(() => {
    if (!draftJson || !ed.dirty) return;
    const timer = setTimeout(() => ed.save(), 600);
    return () => clearTimeout(timer);
  });

  let showJson = $state(false);
  let rawJson = $state('');
  let jsonError = $state('');

  function openJson() {
    if (!draft) return;
    rawJson = JSON.stringify(draft, null, 2);
    jsonError = '';
    showJson = true;
  }

  function applyJson() {
    const parsed = parseNpc(rawJson);
    if (!parsed) { jsonError = 'Ungültiges JSON'; return; }
    ed.draft = parsed;
    showJson = false;
  }

  function toggleSaveProf(key: string) {
    if (!draft) return;
    const stored = draft.savingThrows[key];
    if (stored?.prof) {
      delete draft.savingThrows[key];
    } else {
      const base = mod(draft.stats[key as keyof NpcStats]);
      draft.savingThrows[key] = { bonus: base + 2, prof: true };
    }
  }

  function toggleSkillProf(key: string) {
    if (!draft) return;
    const stored = draft.skills[key];
    if (stored?.prof) {
      delete draft.skills[key];
    } else {
      const skillDef = SKILL_DEFS.find(s => s.key === key);
      const statKey = skillDef ? skillDef.attr : 'str';
      const base = mod(draft.stats[statKey]);
      draft.skills[key] = { bonus: base + 2, prof: true };
    }
  }

  function tagsString(tags: string[]): string { return tags.join(', '); }
  function parseTags(s: string): string[] {
    return s.split(',').map((t) => t.trim()).filter(Boolean);
  }

  const STATUS_LABELS: Record<Npc['status'], string> = {
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

    <div class="npc-header">
      <div class="name-block">
        <input class="npc-name" bind:value={draft.name} placeholder="Name" />
        <input class="npc-role" bind:value={draft.role} placeholder="Rolle" />
      </div>
      <div class="header-right">
        <select class="npc-status status-{draft.status}" bind:value={draft.status}>
          {#each Object.entries(STATUS_LABELS) as [val, label]}
            <option value={val}>{label}</option>
          {/each}
        </select>
        <div class="header-foot">
          {#if ed.saveError}<span class="save-error-msg">{ed.saveError}</span>{/if}
          <span class="dirty-dot">{ed.dirty ? '●' : ''}</span>
          <button class="json-btn" onclick={openJson}>JSON</button>
        </div>
      </div>
    </div>

    <div class="npc-content">

      <div class="section attributes">
        {#each ABILITY_KEYS as attr}
          <div class="attr-box">
            <div class="attr-label">{ABILITY_ABBR_DE[attr]}</div>
            <div class="attr-mod">{modStr(draft.stats[attr])}</div>
            <input class="attr-score" type="number" bind:value={draft.stats[attr]} />
          </div>
        {/each}
      </div>

      <div class="two-col">
        <div class="section">
          <h3>Kampf</h3>
          <div class="stats-grid">
            <div class="stat">
              <span class="sl">RK</span>
              <input class="sv sv-input" type="number" bind:value={draft.ac} />
            </div>
            <div class="stat">
              <span class="sl">TP</span>
              <input class="sv sv-input wide" bind:value={draft.hp} placeholder="z.B. 27 (5W8+5)" />
            </div>
            <div class="stat">
              <span class="sl">Tempo</span>
              <input class="sv sv-input wide" bind:value={draft.speed} placeholder="z.B. 9 m" />
            </div>
          </div>
        </div>

        <div class="section">
          <h3>Rettungswürfe <span class="h3-hint">● = Klick zum Umschalten</span></h3>
          <div class="save-list">
            {#each ABILITY_KEYS as key}
              {@const stored = draft.savingThrows[key]}
              {@const base = mod(draft.stats[key])}
              {@const bonus = stored ? stored.bonus : base}
              {@const prof = stored?.prof ?? false}
              <div class="save-row" class:proficient={prof}>
                <button class="prof-dot" onclick={() => toggleSaveProf(key)} title="Profizenz umschalten">
                  {prof ? '●' : '○'}
                </button>
                <span class="save-label">{ABILITY_ABBR_DE[key]}</span>
                <span class="save-val">{sign(bonus)}</span>
              </div>
            {/each}
          </div>
        </div>
      </div>

      <div class="section">
        <h3>Fertigkeiten <span class="h3-hint">● = Klick zum Umschalten</span></h3>
        <div class="skill-grid">
          {#each SKILL_DEFS as def}
            {@const stored = draft.skills[def.key]}
            {@const statKey = def.attr}
            {@const base = mod(draft.stats[statKey])}
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

      <NpcSpellSection npc={draft} />

      <NpcInventorySection npc={draft} />

      <div class="two-col">
        <div class="section">
          <h3>Beschreibung</h3>
          {#each [{ key: 'appearance', label: 'Aussehen' }, { key: 'personality', label: 'Persönlichkeit' }] as field}
            <div class="npc-field">
              <label>{field.label}</label>
              <textarea
                value={draft[field.key as keyof Npc] as string}
                oninput={(e) => { (draft as unknown as Record<string, unknown>)[field.key] = (e.currentTarget as HTMLTextAreaElement).value; }}
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
                value={draft[field.key as keyof Npc] as string}
                oninput={(e) => { (draft as unknown as Record<string, unknown>)[field.key] = (e.currentTarget as HTMLTextAreaElement).value; }}
                rows="2" placeholder="—"
              ></textarea>
            </div>
          {/each}
        </div>
      </div>

      <div class="section secret-section">
        <h3>Geheimnis</h3>
        <textarea class="secret-ta" bind:value={draft.secret} rows="2" placeholder="—"></textarea>
      </div>

      <div class="section">
        <h3>Tags</h3>
        <input
          class="tags-input"
          value={tagsString(draft.tags)}
          oninput={(e) => { draft.tags = parseTags((e.currentTarget as HTMLInputElement).value); }}
          placeholder="kommagetrennt"
        />
      </div>

    </div>
  </div>
{/if}

<style>
  .npc-empty { padding: 2rem; color: var(--ink-muted); }

  .npc-sheet {
    flex: 1;
    overflow-y: auto;
    background: var(--bg);
    color: var(--ink);
    font-size: 0.9rem;
  }

  .npc-header {
    padding: 0.9rem 1.5rem 0.6rem;
    border-bottom: 1px solid var(--surface);
    display: flex;
    align-items: flex-start;
    gap: 1rem;
  }

  .name-block { flex: 1; display: flex; flex-direction: column; gap: 0.2rem; }

  .npc-name {
    background: none;
    border: none;
    color: var(--arcane);
    font-size: 1.4rem;
    font-weight: 700;
    padding: 0;
    outline: none;
    font-family: inherit;
    width: 100%;
  }
  .npc-name:focus { border-bottom: 1px solid var(--red); }

  .npc-role {
    background: none;
    border: none;
    color: var(--ink-muted);
    font-size: 0.85rem;
    font-style: italic;
    padding: 0;
    outline: none;
    font-family: inherit;
    width: 100%;
  }
  .npc-role:focus { border-bottom: 1px solid var(--surface); }

  .header-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.35rem;
    flex-shrink: 0;
  }

  .npc-status {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 99px;
    color: var(--ink);
    font-size: 0.75rem;
    padding: 0.2rem 0.6rem;
    cursor: pointer;
    outline: none;
    font-family: inherit;
  }
  .npc-status.status-lebendig { color: var(--green); border-color: var(--green); }
  .npc-status.status-tot      { color: var(--ink-muted); border-color: var(--border); }
  .npc-status.status-vermisst { color: var(--copper); border-color: var(--copper); }
  .npc-status.status-unbekannt{ color: var(--red); border-color: var(--red); }

  .header-foot {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .dirty-dot { font-size: 0.7rem; color: var(--danger); width: 0.8rem; }
  .save-error-msg { font-size: 0.72rem; color: var(--danger); }

  .json-btn {
    background: none;
    border: 1px solid var(--surface);
    border-radius: 4px;
    color: var(--ink-muted);
    font-size: 0.75rem;
    padding: 0.2rem 0.55rem;
    cursor: pointer;
    font-family: inherit;
  }
  .json-btn:hover { border-color: var(--ink-muted); color: var(--ink); }

  .npc-content {
    padding: 1rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .attributes {
    display: flex;
    gap: 0.5rem;
  }

  .attr-box {
    background: var(--surface);
    border-radius: 6px;
    padding: 0.4rem 0.6rem;
    text-align: center;
    min-width: 52px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.1rem;
  }

  .attr-label { font-size: 0.65rem; color: var(--ink-muted); text-transform: uppercase; }
  .attr-mod   { font-size: 1.15rem; font-weight: 700; color: var(--arcane); line-height: 1.2; }
  .attr-score {
    width: 2.5rem;
    background: none;
    border: none;
    border-top: 1px solid var(--border);
    color: var(--ink-soft);
    font-size: 0.75rem;
    font-family: inherit;
    text-align: center;
    outline: none;
    padding: 0.1rem 0 0;
  }
  .attr-score:focus { border-top-color: var(--red); }

  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .stats-grid {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .stat { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
  .sl { color: var(--ink-muted); font-size: 0.8rem; white-space: nowrap; }
  .sv { font-weight: 600; color: var(--ink); }

  .sv-input {
    background: var(--bg-panel);
    border: 1px solid var(--surface);
    border-radius: 4px;
    color: var(--ink);
    font-size: 0.82rem;
    font-weight: 600;
    font-family: inherit;
    padding: 0.15rem 0.4rem;
    outline: none;
    width: 4rem;
    text-align: right;
  }
  .sv-input.wide { width: 8rem; text-align: left; }
  .sv-input:focus { border-color: var(--red); }

  .save-list { display: flex; flex-direction: column; gap: 0.15rem; }

  .save-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.82rem;
  }
  .save-row.proficient .save-val { color: var(--green); }

  .prof-dot {
    background: none;
    border: none;
    padding: 0;
    font-size: 0.65rem;
    color: var(--ink-muted);
    width: 0.8rem;
    cursor: pointer;
    line-height: 1;
  }
  .proficient .prof-dot { color: var(--green); }

  .save-label { flex: 1; color: var(--ink-soft); }
  .save-val   { font-weight: 600; min-width: 2rem; text-align: right; }

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
  .skill-row.proficient .skill-val { color: var(--green); }

  .skill-name { flex: 1; color: var(--ink-soft); }
  .skill-val  { font-weight: 600; min-width: 2rem; text-align: right; }

  .npc-field { display: flex; flex-direction: column; gap: 0.15rem; margin-bottom: 0.35rem; }

  .npc-field label {
    font-size: 0.68rem;
    font-weight: 600;
    color: var(--ink-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .npc-field textarea {
    background: var(--bg-panel);
    border: 1px solid var(--surface);
    border-radius: 4px;
    color: var(--ink);
    font-size: 0.85rem;
    line-height: 1.5;
    padding: 0.3rem 0.5rem;
    outline: none;
    resize: vertical;
    font-family: inherit;
  }
  .npc-field textarea:focus { border-color: var(--red); }

  .secret-ta {
    width: 100%;
    box-sizing: border-box;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink);
    font-size: 0.85rem;
    line-height: 1.5;
    padding: 0.3rem 0.5rem;
    outline: none;
    resize: vertical;
    font-family: inherit;
  }
  .secret-ta:focus { border-color: var(--danger); }

  .tags-input {
    width: 100%;
    box-sizing: border-box;
    background: var(--bg-panel);
    border: 1px solid var(--surface);
    border-radius: 4px;
    color: var(--ink);
    font-size: 0.85rem;
    padding: 0.3rem 0.5rem;
    outline: none;
    font-family: inherit;
  }
  .tags-input:focus { border-color: var(--red); }

  .npc-json-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }

  .json-toolbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 1rem;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--surface);
  }
  .json-label { font-size: 0.75rem; color: var(--ink-muted); }
  .json-error { font-size: 0.75rem; color: var(--danger); }
  .json-toolbar button {
    background: none;
    border: 1px solid var(--surface);
    border-radius: 4px;
    color: var(--ink);
    font-size: 0.8rem;
    padding: 0.2rem 0.6rem;
    cursor: pointer;
    font-family: inherit;
  }
  .json-toolbar button:hover { border-color: var(--red); color: var(--red); }

  .json-ta {
    flex: 1;
    padding: 1rem 1.5rem;
    background: var(--bg);
    color: var(--ink);
    border: none;
    outline: none;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 0.88rem;
    line-height: 1.7;
    resize: none;
  }
</style>
