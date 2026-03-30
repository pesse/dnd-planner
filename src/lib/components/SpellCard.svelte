<script lang="ts">
  import { activeFile, setFileContent } from '$lib/stores/campaign';
  import { invoke } from '@tauri-apps/api/core';
  import { get } from 'svelte/store';
  import { onMount } from 'svelte';
  import { pushError } from '$lib/stores/errors';
  import type { Spell } from '$lib/types';

  const SCHOOL_COLORS: Record<string, string> = {
    abjuration:    '#89b4fa',
    conjuration:   '#a6e3a1',
    divination:    '#f9e2af',
    enchantment:   '#f5c2e7',
    evocation:     '#f38ba8',
    illusion:      '#89dceb',
    necromancy:    '#cba6f7',
    transmutation: '#fab387',
  };

  const SCHOOL_LABELS: Record<string, string> = {
    abjuration:    'Bannmagie',
    conjuration:   'Beschwörung',
    divination:    'Erkenntnismagie',
    enchantment:   'Verzauberung',
    evocation:     'Hervorrufung',
    illusion:      'Illusionsmagie',
    necromancy:    'Nekromantie',
    transmutation: 'Verwandlung',
  };

  const SOURCE_LABELS: Record<string, string> = {
    SRD:      'Offiziell',
    Homebrew: 'Homebrew',
    own:      'Eigen',
    eigen:    'Eigen',
  };

  const CLASS_KEYS = ['sorcerer', 'wizard', 'bard', 'druid', 'ranger', 'cleric', 'warlock', 'paladin'] as const;
  const CLASS_LABELS: Record<string, string> = {
    sorcerer: 'Zauberer',
    wizard:   'Magier',
    bard:     'Barde',
    druid:    'Druide',
    ranger:   'Waldläufer',
    cleric:   'Kleriker',
    warlock:  'Hexenmeister',
    paladin:  'Paladin',
  };

  const LEVEL_OPTIONS = [
    { value: 'cantrip', label: 'Zaubertrick' },
    ...Array.from({ length: 9 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}. Grad` })),
  ];

  let rawJson = $state('');

  onMount(() => {
    async function load(path: string) {
      try {
        const content = await invoke<string>('read_file_content', { path });
        rawJson = content;
        setFileContent(content);
      } catch (e) {
        pushError(`Zauber konnte nicht geladen werden: ${e instanceof Error ? e.message : e}`);
        rawJson = '{}';
      }
    }

    const initial = get(activeFile);
    if (initial?.type === 'spell' && initial.path) load(initial.path);

    const unsub = activeFile.subscribe(file => {
      if (file?.type === 'spell' && file.path) load(file.path);
    });
    return unsub;
  });

  let parsed = $derived.by(() => {
    if (!rawJson) return { spell: null as Spell | null, parseError: null as string | null };
    try {
      return { spell: JSON.parse(rawJson) as Spell, parseError: null };
    } catch (e) {
      return { spell: null, parseError: e instanceof Error ? e.message : String(e) };
    }
  });
  let spell = $derived(parsed.spell);
  let parseError = $derived(parsed.parseError);

  let color = $derived(spell ? (SCHOOL_COLORS[spell.school] ?? '#cba6f7') : '#cba6f7');

  let editing = $state(false);
  let draft = $state<Spell | null>(null);

  function startEdit() {
    if (!spell) return;
    draft = JSON.parse(JSON.stringify(spell));
    editing = true;
  }

  function discard() {
    editing = false;
    draft = null;
  }

  async function save() {
    if (!draft || !$activeFile) return;
    const json = JSON.stringify(draft, null, 2);
    try {
      await invoke('write_file_content', { path: $activeFile.path, content: json });
      rawJson = json;
      setFileContent(json);
      editing = false;
      draft = null;
    } catch (e) {
      console.error('Speichern fehlgeschlagen:', e);
    }
  }

  function levelLabel(level: string): string {
    if (level === 'cantrip' || level === '0') return 'Zaubertrick';
    return `${level}. Grad`;
  }

  function componentStr(s: Spell): string {
    const parts: string[] = [];
    if (s.components.verbal)   parts.push('V');
    if (s.components.somatic)  parts.push('G');
    if (s.components.material) parts.push('M');
    return parts.join(', ') || '—';
  }
</script>

<div class="spell-area">
  {#if spell && !editing}
    <!-- Anzeigemodus -->
    <div class="spell-card" style="--school-color: {color}">
      <div class="card-header">
        <div class="header-top">
          <div class="header-name">{spell.name}</div>
          <button class="edit-btn" onclick={startEdit}>✏ Bearbeiten</button>
        </div>
        <div class="header-sub">
          <span class="header-level">{levelLabel(spell.level)}</span>
          <span class="header-school">{SCHOOL_LABELS[spell.school] ?? spell.school}</span>
          {#if spell.ritual}<span class="ritual-badge">Ritual</span>{/if}
        </div>
      </div>

      <div class="card-props">
        <div class="prop-row">
          <span class="prop-label">Zauberdauer</span>
          <span class="prop-value">{spell.casting_time}</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">Reichweite</span>
          <span class="prop-value">{spell.range}</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">Komponenten</span>
          <span class="prop-value">
            {componentStr(spell)}
            {#if spell.components.materials_needed}
              <span class="material-note">({spell.components.materials_needed})</span>
            {/if}
          </span>
        </div>
        <div class="prop-row">
          <span class="prop-label">Dauer</span>
          <span class="prop-value">{spell.duration}</span>
        </div>
      </div>

      <div class="card-divider"></div>
      <div class="card-description">{spell.description}</div>

      {#if spell.higher_levels}
        <div class="card-divider"></div>
        <div class="card-higher">
          <span class="higher-label">Auf höheren Graden.</span>
          {spell.higher_levels}
        </div>
      {/if}

      <div class="card-divider"></div>
      <div class="card-footer">
        <span class="footer-classes">
          {spell.classes.map(c => CLASS_LABELS[c] ?? c).join(' · ')}
        </span>
        <span class="footer-source">{SOURCE_LABELS[spell.source] ?? spell.source}</span>
      </div>
    </div>

  {:else if draft}
    <!-- Bearbeitungsmodus -->
    {@const draftColor = SCHOOL_COLORS[draft.school] ?? '#cba6f7'}
    <div class="spell-card edit-mode" style="--school-color: {draftColor}">
      <div class="card-header">
        <div class="edit-header-top">
          <input class="edit-name" bind:value={draft.name} placeholder="Name" />
          <div class="edit-actions">
            <button class="save-btn" onclick={save}>Speichern</button>
            <button class="discard-btn" onclick={discard}>Verwerfen</button>
          </div>
        </div>
        <div class="edit-header-meta">
          <select class="edit-select" bind:value={draft.level}>
            {#each LEVEL_OPTIONS as opt}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
          <select class="edit-select" bind:value={draft.school}>
            {#each Object.entries(SCHOOL_LABELS) as [key, label]}
              <option value={key}>{label}</option>
            {/each}
          </select>
          <label class="edit-check">
            <input type="checkbox" bind:checked={draft.ritual} />
            Ritual
          </label>
        </div>
      </div>

      <div class="card-props">
        <div class="prop-row">
          <span class="prop-label">Zauberdauer</span>
          <input class="edit-input" bind:value={draft.casting_time} />
        </div>
        <div class="prop-row">
          <span class="prop-label">Reichweite</span>
          <input class="edit-input" bind:value={draft.range} />
        </div>
        <div class="prop-row">
          <span class="prop-label">Komponenten</span>
          <div class="comp-row">
            <label class="edit-check"><input type="checkbox" bind:checked={draft.components.verbal} /> V</label>
            <label class="edit-check"><input type="checkbox" bind:checked={draft.components.somatic} /> G</label>
            <label class="edit-check"><input type="checkbox" bind:checked={draft.components.material} /> M</label>
          </div>
        </div>
        {#if draft.components.material}
          <div class="prop-row">
            <span class="prop-label">Materialien</span>
            <input class="edit-input" bind:value={draft.components.materials_needed} placeholder="z.B. ein Rubin im Wert von 50 GM" />
          </div>
        {/if}
        <div class="prop-row">
          <span class="prop-label">Dauer</span>
          <input class="edit-input" bind:value={draft.duration} />
        </div>
      </div>

      <div class="card-divider"></div>
      <div class="edit-section">
        <span class="edit-section-label">Beschreibung</span>
        <textarea class="edit-textarea" bind:value={draft.description} rows={8}></textarea>
      </div>

      <div class="card-divider"></div>
      <div class="edit-section">
        <span class="edit-section-label">Auf höheren Graden</span>
        <textarea class="edit-textarea" bind:value={draft.higher_levels} rows={3} placeholder="Optional…"></textarea>
      </div>

      <div class="card-divider"></div>
      <div class="edit-section">
        <span class="edit-section-label">Klassen</span>
        <div class="class-grid">
          {#each CLASS_KEYS as key}
            <label class="edit-check">
              <input
                type="checkbox"
                checked={draft.classes.includes(key)}
                onchange={(e) => {
                  if ((e.target as HTMLInputElement).checked) {
                    draft!.classes = [...draft!.classes, key];
                  } else {
                    draft!.classes = draft!.classes.filter(c => c !== key);
                  }
                }}
              />
              {CLASS_LABELS[key]}
            </label>
          {/each}
        </div>
      </div>
    </div>

  {:else if parseError}
    <div class="error">
      <div class="error-title">Ungültiges JSON — Zauber kann nicht angezeigt werden</div>
      <pre class="error-detail">{parseError}</pre>
    </div>
  {:else}
    <div class="error">Zauber konnte nicht geladen werden.</div>
  {/if}
</div>

<style>
  .spell-area {
    flex: 1;
    overflow-y: auto;
    display: flex;
    justify-content: center;
    padding: 2rem 1rem;
    background: #1e1e2e;
  }

  .spell-card {
    width: 100%;
    max-width: 560px;
    background: #181825;
    border-radius: 10px;
    border: 1px solid #313244;
    overflow: hidden;
    box-shadow: 0 4px 24px #00000055;
    height: fit-content;
  }

  /* Header */
  .card-header {
    background: color-mix(in srgb, var(--school-color) 18%, #181825);
    border-bottom: 3px solid var(--school-color);
    padding: 1.2rem 1.4rem 1rem;
  }

  .header-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 0.4rem;
  }

  .header-name {
    font-size: 1.5rem;
    font-weight: 700;
    color: #cdd6f4;
    letter-spacing: 0.01em;
    line-height: 1.2;
  }

  .edit-btn {
    background: #313244;
    border: 1px solid #45475a;
    color: #a6adc8;
    cursor: pointer;
    font-size: 0.78rem;
    padding: 0.25rem 0.65rem;
    border-radius: 5px;
    margin-top: 0.15rem;
    flex-shrink: 0;
    white-space: nowrap;
  }
  .edit-btn:hover { color: #cba6f7; border-color: #cba6f7; }

  .header-sub {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .header-level { font-size: 0.85rem; color: var(--school-color); font-weight: 600; }
  .header-school { font-size: 0.82rem; color: #6c7086; }

  .ritual-badge {
    font-size: 0.72rem;
    color: #1e1e2e;
    background: var(--school-color);
    border-radius: 3px;
    padding: 0.1rem 0.5rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  /* Props */
  .card-props {
    padding: 0.9rem 1.4rem;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .prop-row {
    display: grid;
    grid-template-columns: 7.5rem 1fr;
    gap: 0.5rem;
    font-size: 0.88rem;
    line-height: 1.4;
    align-items: center;
  }

  .prop-label {
    color: #6c7086;
    font-weight: 600;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .prop-value { color: #cdd6f4; }

  .material-note { color: #6c7086; font-style: italic; font-size: 0.82rem; }

  .card-divider { height: 1px; background: #313244; margin: 0 1.4rem; }

  .card-description {
    padding: 0.9rem 1.4rem;
    font-size: 0.88rem;
    color: #cdd6f4;
    line-height: 1.65;
    white-space: pre-wrap;
  }

  .card-higher {
    padding: 0.9rem 1.4rem;
    font-size: 0.85rem;
    color: #a6adc8;
    line-height: 1.6;
    white-space: pre-wrap;
  }

  .higher-label { color: var(--school-color); font-weight: 700; margin-right: 0.3rem; }

  .card-footer {
    padding: 0.7rem 1.4rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: color-mix(in srgb, var(--school-color) 6%, #181825);
  }

  .footer-classes { font-size: 0.8rem; color: #6c7086; font-style: italic; }
  .footer-source { font-size: 0.72rem; color: #45475a; text-transform: uppercase; letter-spacing: 0.05em; }

  /* Edit mode */
  .edit-header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.6rem;
  }

  .edit-name {
    font-size: 1.3rem;
    font-weight: 700;
    background: #313244;
    border: 1px solid #45475a;
    border-radius: 5px;
    color: #cdd6f4;
    padding: 0.3rem 0.6rem;
    flex: 1;
    min-width: 0;
    font-family: inherit;
    outline: none;
  }
  .edit-name:focus { border-color: var(--school-color); }

  .edit-actions { display: flex; gap: 0.4rem; flex-shrink: 0; }

  .save-btn {
    background: #a6e3a1;
    border: none;
    border-radius: 4px;
    color: #1e1e2e;
    font-size: 0.8rem;
    font-weight: 700;
    padding: 0.3rem 0.7rem;
    cursor: pointer;
  }
  .save-btn:hover { background: #94d3a2; }

  .discard-btn {
    background: #313244;
    border: none;
    border-radius: 4px;
    color: #6c7086;
    font-size: 0.8rem;
    padding: 0.3rem 0.7rem;
    cursor: pointer;
  }
  .discard-btn:hover { color: #f38ba8; }

  .edit-header-meta {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    align-items: center;
  }

  .edit-select {
    background: #313244;
    border: 1px solid #45475a;
    border-radius: 4px;
    color: #cdd6f4;
    font-size: 0.82rem;
    padding: 0.2rem 0.4rem;
    outline: none;
    font-family: inherit;
  }
  .edit-select:focus { border-color: var(--school-color); }

  .edit-input {
    background: #313244;
    border: 1px solid #45475a;
    border-radius: 4px;
    color: #cdd6f4;
    font-size: 0.85rem;
    padding: 0.2rem 0.5rem;
    outline: none;
    font-family: inherit;
    width: 100%;
  }
  .edit-input:focus { border-color: var(--school-color); }

  .edit-check {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.82rem;
    color: #a6adc8;
    cursor: pointer;
  }

  .comp-row { display: flex; gap: 0.8rem; align-items: center; }

  .edit-section {
    padding: 0.7rem 1.4rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .edit-section-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6c7086;
  }

  .edit-textarea {
    background: #313244;
    border: 1px solid #45475a;
    border-radius: 4px;
    color: #cdd6f4;
    font-size: 0.85rem;
    padding: 0.4rem 0.6rem;
    resize: vertical;
    outline: none;
    font-family: inherit;
    line-height: 1.6;
    width: 100%;
  }
  .edit-textarea:focus { border-color: var(--school-color); }

  .class-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.4rem;
  }

  .error { color: #f38ba8; padding: 2rem; font-size: 0.9rem; }
  .error-title { font-weight: 600; margin-bottom: 0.6rem; }
  .error-detail {
    font-family: monospace;
    font-size: 0.8rem;
    color: #fab387;
    background: #181825;
    border: 1px solid #313244;
    border-radius: 4px;
    padding: 0.6rem 0.8rem;
    white-space: pre-wrap;
    word-break: break-all;
    margin: 0;
  }
</style>
