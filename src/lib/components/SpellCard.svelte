<script lang="ts">
  import { activeFile, setFileContent } from '$lib/stores/campaign';
  import { invoke } from '@tauri-apps/api/core';
  import { get } from 'svelte/store';
  import { onMount } from 'svelte';
  import { pushError } from '$lib/stores/errors';
  import type { Spell } from '$lib/types';
  import { normalizeSpell, spellLevelLabel, spellDesc, spellHigherLevel, SPELL_SCHOOLS, SPELL_CLASS_LABELS } from '$lib/types';
  import { prepareSpellPrint } from '$lib/utils/printSpell';
  import SpellEditForm from './SpellEditForm.svelte';
  import EditorPanel from './EditorPanel.svelte';

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

  const PRINT_SCHOOL_COLORS: Record<string, string> = {
    abjuration:    '#6a9fd8',
    conjuration:   '#5aaa6a',
    divination:    '#c8a020',
    enchantment:   '#c060a0',
    evocation:     '#c83030',
    illusion:      '#30a0b8',
    necromancy:    '#8858c8',
    transmutation: '#c07030',
  };

  function parseSpell(json: string): Spell | null {
    try {
      const obj = JSON.parse(json);
      if (!obj || typeof obj !== 'object' || !('school' in obj)) return null;
      return normalizeSpell(obj as Record<string, unknown>);
    } catch { return null; }
  }

  type Tab = 'karte' | 'bearbeiten' | 'json';
  let tab       = $state<Tab>('bearbeiten');
  let draft     = $state<Spell | null>(null);
  let dirty     = $state(false);
  let saveError = $state('');
  let lastSavedContent = $state('');

  onMount(() => {
    async function load(path: string) {
      try {
        const content = await invoke<string>('read_file_content', { path });
        lastSavedContent = content;
        draft = structuredClone(parseSpell(content));
        dirty = false;
        saveError = '';
        tab = 'bearbeiten';
        setFileContent(content);
      } catch (e) {
        pushError(`Zauber konnte nicht geladen werden: ${e instanceof Error ? e.message : e}`);
        draft = null;
        lastSavedContent = '';
      }
    }

    const initial = get(activeFile);
    if (initial?.type === 'spell' && initial.path) load(initial.path);

    const unsub = activeFile.subscribe(file => {
      if (file?.type === 'spell' && file.path) load(file.path);
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
    draft = structuredClone(parseSpell(lastSavedContent));
    dirty = false;
    saveError = '';
  }

  async function saveJson(json: string) {
    const file = $activeFile;
    if (!file?.path) return;
    lastSavedContent = json;
    await invoke('write_file_content', { path: file.path, content: json });
    setFileContent(json);
    draft = parseSpell(json);
    dirty = false;
  }

  // ── Beschreibungs-Splitting für Kartenansicht ────────────────────────────────

  const SCREEN_DESC_FONT = "'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif";
  // 380px Kartenbreite − 2×1.1rem horizontales Padding (≈17.6px)
  const SCREEN_CARD_TEXT_W = 346;

  function splitScreenDesc(description: string): string[] {
    if (!description) return [''];
    // Erste Karte: nach Header, Props, 2×Ornament, Footer bleibt ~260px für Beschreibung
    // Folge-Karten: nach Mini-Header + Ornament bleiben ~380px
    const FIRST_H = 260;
    const CONT_H  = 380;

    const el = document.createElement('div');
    el.style.cssText = [
      'position:fixed', 'top:-9999px', 'left:-9999px',
      `font-family:${SCREEN_DESC_FONT}`,
      'font-size:0.82rem',
      'line-height:1.55',
      'white-space:pre-wrap',
      'word-break:break-word',
      'overflow:hidden',
      'box-sizing:border-box',
      `width:${SCREEN_CARD_TEXT_W}px`,
      'padding:0.55rem 0',
    ].join(';');
    document.body.appendChild(el);

    const chunks: string[] = [];
    let remaining = description;
    let isFirst = true;

    try {
      while (remaining.length > 0) {
        const maxH = isFirst ? FIRST_H : CONT_H;
        el.style.height = `${maxH}px`;
        el.textContent = remaining;

        if (el.scrollHeight <= el.clientHeight + 2) {
          chunks.push(remaining);
          break;
        }

        const positions: number[] = [0];
        for (let i = 1; i < remaining.length; i++) {
          const ch = remaining[i - 1];
          if (ch === ' ' || ch === '\n') positions.push(i);
        }
        positions.push(remaining.length);

        let lo = 0, hi = positions.length - 1;
        while (lo < hi - 1) {
          const mid = Math.floor((lo + hi) / 2);
          el.textContent = remaining.slice(0, positions[mid]);
          if (el.scrollHeight <= el.clientHeight + 2) lo = mid;
          else hi = mid;
        }

        const chunk = remaining.slice(0, positions[lo]).trimEnd();
        if (!chunk) {
          chunks.push(remaining.slice(0, 80));
          remaining = remaining.slice(80).trimStart();
        } else {
          chunks.push(chunk);
          remaining = remaining.slice(chunk.length).trimStart();
        }
        isFirst = false;
      }
    } finally {
      document.body.removeChild(el);
    }

    return chunks.length > 0 ? chunks : [''];
  }

  let descChunks = $state<string[]>(['']);

  $effect(() => {
    const d = draft;
    if (d) descChunks = splitScreenDesc(spellDesc(d));
    else descChunks = [''];
  });

  function componentStr(s: Spell): string {
    const parts: string[] = [];
    if (s.components.verbal)   parts.push('V');
    if (s.components.somatic)  parts.push('G');
    if (s.components.material) parts.push('M');
    return parts.join(', ') || '—';
  }

  function printSpell() {
    if (!draft) return;
    const html = prepareSpellPrint(draft, document);
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:none;visibility:hidden;';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument!;
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => {
      const prev = document.title;
      document.title = draft!.name;
      iframe.contentWindow!.focus();
      iframe.contentWindow!.print();
      document.title = prev;
      setTimeout(() => document.body.removeChild(iframe), 2000);
    }, 0);
  }
</script>

{#if draft}
  {@const color = SCHOOL_COLORS[draft.school] ?? '#cba6f7'}
  <EditorPanel
    bind:tab
    {dirty}
    {saveError}
    onsave={save}
    ondiscard={discard}
    onsavejson={saveJson}
    getJson={() => draft ? JSON.stringify(draft, null, 2) : lastSavedContent}
    style="--ep-accent: {color}"
  >
    {#snippet tabactions()}
      <button class="pdf-tab-btn" onclick={printSpell}>PDF</button>
    {/snippet}
    {#snippet karte()}
      {@const higherLevel = spellHigherLevel(draft!)}
      {@const comps = componentStr(draft!)}
      {@const pc = PRINT_SCHOOL_COLORS[draft!.school] ?? '#888'}
      <div class="cards-wrap">
        {#each descChunks as chunk, i}
          {@const isLast = i === descChunks.length - 1}
          <div class="spell-card" style="--c: {pc}">
            {#if i === 0}
              <div class="head">
                <div class="name">
                  {draft!.name}{#if draft!.ritual} <span class="ritual">Ritual</span>{/if}
                </div>
                <div class="meta">{spellLevelLabel(draft!.level)} · {SPELL_SCHOOLS[draft!.school] ?? draft!.school}</div>
              </div>
              <div class="orndiv"><div class="ol"></div><span class="og">✦</span><div class="ol"></div></div>
              <div class="props">
                <div class="prop-row">
                  <span class="pc"><span class="icon">⚡</span>{draft!.casting_time}</span>
                  <span class="pc"><span class="icon">◎</span>{draft!.range}</span>
                  <span class="pc"><span class="icon">⌛</span>{draft!.duration.replace('Konzentration, ', 'Konz. ')}</span>
                </div>
                <div class="prop">
                  <span class="icon">✦</span>
                  <span>{comps}{#if draft!.components.materials_needed} <span class="mat">({draft!.components.materials_needed})</span>{/if}</span>
                </div>
              </div>
            {:else}
              <div class="head-cont">
                <span class="name-sm">{draft!.name}</span>
                <span class="cont-lbl">({i + 1})</span>
              </div>
            {/if}
            <div class="orndiv"><div class="ol"></div><span class="og">✦</span><div class="ol"></div></div>
            <div class="desc">{chunk}</div>
            {#if isLast && higherLevel}
              <div class="higher"><span class="higher-lbl">Auf höheren Graden.</span> {higherLevel}</div>
            {/if}
            {#if i === 0}
              <div class="foot">
                <span>{draft!.classes.map(c => SPELL_CLASS_LABELS[c] ?? c).join(' · ')}</span>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/snippet}

    {#snippet bearbeiten()}
      <div class="edit-wrap" style="--mef-accent: {color}">
        <SpellEditForm bind:spell={draft!} onchange={mark} />
      </div>
    {/snippet}
  </EditorPanel>
{:else}
  <!-- Fehler-Fallback wenn kein Draft (ungültiges JSON oder noch nicht geladen) -->
  <EditorPanel
    bind:tab
    dirty={false}
    onsavejson={saveJson}
    getJson={() => lastSavedContent}
  >
    {#snippet karte()}
      <p class="parse-error">Kein gültiger Zauber-Datensatz.</p>
    {/snippet}
    {#snippet bearbeiten()}
      <p class="parse-error">
        Ungültiges Zauber-JSON.
        <button onclick={() => tab = 'json'}>JSON bearbeiten</button>
      </p>
    {/snippet}
  </EditorPanel>
{/if}

<style>
  /* ── Karten-Container ── */
  .cards-wrap {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    align-items: center;
    width: 100%;
  }

  /* ── Karte (Druckstil) ── */
  .spell-card {
    width: 100%;
    max-width: 380px;
    background: #fef8ec;
    border: 1.5px solid #9a7a3a;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 3px 16px #0000003a;
    display: flex;
    flex-direction: column;
    color: #1a0a00;
    font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif;
    position: relative;
  }
  .spell-card::after {
    content: '';
    position: absolute;
    inset: 3px;
    border: 1px solid #c4a050;
    border-radius: 5px;
    pointer-events: none;
    z-index: 5;
  }

  .head {
    padding: 0.9rem 1.2rem 0.65rem;
    text-align: center;
    flex-shrink: 0;
    background: linear-gradient(to bottom,
      color-mix(in srgb, var(--c) 55%, #fef8ec) 0%,
      color-mix(in srgb, var(--c) 10%, #fef8ec) 100%);
  }
  .name {
    font-size: 1.05rem;
    font-weight: 700;
    font-variant: small-caps;
    color: #1a0a00;
    line-height: 1.2;
    letter-spacing: 0.02em;
  }
  .ritual {
    font-size: 0.58rem;
    font-weight: 700;
    font-variant: normal;
    background: var(--c);
    color: white;
    border-radius: 2px;
    padding: 1px 4px;
    vertical-align: middle;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .meta {
    font-size: 0.75rem;
    color: color-mix(in srgb, var(--c) 80%, #333);
    margin-top: 0.2rem;
    font-style: italic;
  }

  /* ── Folge-Karten-Header ── */
  .head-cont {
    padding: 0.6rem 1.2rem 0.4rem;
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    justify-content: center;
    flex-shrink: 0;
    background: linear-gradient(to bottom,
      color-mix(in srgb, var(--c) 30%, #fef8ec) 0%,
      color-mix(in srgb, var(--c) 6%, #fef8ec) 100%);
  }
  .name-sm {
    font-size: 0.95rem;
    font-weight: 700;
    font-variant: small-caps;
    color: #1a0a00;
  }
  .cont-lbl {
    font-size: 0.68rem;
    color: #aaa;
    font-style: italic;
  }

  .orndiv {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 0 10px;
    flex-shrink: 0;
  }
  .ol {
    flex: 1;
    height: 1px;
    background: linear-gradient(to right, transparent, var(--c) 30%, var(--c) 70%, transparent);
  }
  .orndiv .ol:last-child {
    background: linear-gradient(to left, transparent, var(--c) 30%, var(--c) 70%, transparent);
  }
  .og {
    font-size: 0.65rem;
    color: var(--c);
    line-height: 1;
  }

  .props {
    padding: 0.45rem 1.1rem;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.78rem;
    line-height: 1.4;
  }
  .pc {
    display: inline;
    margin-right: 0.65rem;
  }
  .prop {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
  }
  .icon {
    color: var(--c);
    flex-shrink: 0;
    width: 0.9rem;
    text-align: center;
    display: inline-block;
  }
  .mat {
    color: #888;
    font-style: italic;
  }

  .desc {
    padding: 0.55rem 1.1rem;
    font-size: 0.82rem;
    line-height: 1.55;
    color: #1a0a00;
    white-space: pre-wrap;
  }

  .higher {
    padding: 0 1.1rem 0.55rem;
    font-size: 0.77rem;
    line-height: 1.45;
    color: #3a2800;
    white-space: pre-wrap;
  }
  .higher-lbl {
    font-weight: 700;
    color: var(--c);
  }

  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.4rem 1.1rem;
    border-top: 1px solid #c4a050;
    background: color-mix(in srgb, var(--c) 6%, #fef8ec);
    font-size: 0.72rem;
    color: #888;
    font-style: italic;
    flex-shrink: 0;
  }
  .pdf-tab-btn {
    background: none;
    border: 1px solid #45475a;
    color: #6c7086;
    cursor: pointer;
    font-size: 0.75rem;
    padding: 0.15rem 0.55rem;
    border-radius: 4px;
    font-family: inherit;
  }
  .pdf-tab-btn:hover {
    color: #cdd6f4;
    border-color: #6c7086;
  }

  /* ── Bearbeiten-Container ── */
  .edit-wrap {
    background: #1e1e2e;
    border: 1px solid color-mix(in srgb, var(--mef-accent, #cba6f7) 25%, #313244);
    border-radius: 6px;
    padding: 1rem 1.25rem;
    max-width: 560px;
    width: 100%;
  }

  .parse-error { color: #f38ba8; font-size: 0.9rem; }
  .parse-error button {
    background: none; border: none; color: #89b4fa;
    cursor: pointer; text-decoration: underline; font-family: inherit;
  }
</style>
