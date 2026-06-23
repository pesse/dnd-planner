<script lang="ts">
  import type { Spell } from '$lib/types';
  import { spellLevelLabel, spellDesc, spellHigherLevel, SPELL_SCHOOLS, SPELL_CLASS_LABELS } from '$lib/types';
  import { prepareSpellPrint } from '$lib/utils/printSpell';
  import { SCHOOL_COLORS } from '$lib/spellLibrary';
  import { parseSpell as _parseSpell } from '$lib/utils/schemaValidation';
  import SpellEditForm from './SpellEditForm.svelte';
  import EditorPanel from './EditorPanel.svelte';
  import { createCardEditor } from '$lib/editor/cardEditor.svelte';
  import { slugify } from '$lib/editor/saveAs';
  import { invalidateVault } from '$lib/stores/campaign';

  function parseSpell(json: string): Spell | null {
    try {
      const result = _parseSpell(JSON.parse(json));
      return result.ok ? result.data : null;
    } catch { return null; }
  }

  // school (englisch im JSON) → Ordnername (deutsch im Vault)
  const SCHOOL_TO_DIR: Record<string, string> = {
    abjuration: 'bannmagie', conjuration: 'beschwörung', divination: 'erkenntnismagie',
    enchantment: 'verzauberung', evocation: 'hervorrufung', illusion: 'illusionsmagie',
    necromancy: 'nekromantie', transmutation: 'verwandlung',
  };

  const ed = createCardEditor<Spell>({
    type: 'spell',
    label: 'Zauber',
    parse: parseSpell,
    defaultName: (s) => slugify(s.name || 'zauber'),
    location: {
      bucketLabel: 'Schule',
      bucketOf: (s) => SCHOOL_TO_DIR[s.school],
      buckets: () => Object.entries(SCHOOL_TO_DIR).map(([key, dir]) => ({
        value: dir,
        label: SPELL_SCHOOLS[key as keyof typeof SPELL_SCHOOLS] ?? dir,
      })),
      resolvePath: (_s, name, bucket) => `./vault/spells/${bucket}/${name}.json`,
    },
    onSaved: () => invalidateVault(),
  });

  // Lese-Aliase fürs bestehende Markup; Schreibzugriffe (tab, draft-Bindung) gehen direkt auf ed.*
  let draft = $derived(ed.draft);
  let dirty = $derived(ed.dirty);
  let saveError = $derived(ed.saveError);
  let lastSavedContent = $derived(ed.lastSavedContent);
  const save = () => ed.save();
  const discard = () => ed.discard();
  const saveJson = (json: string) => ed.saveJson(json);

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
  {@const color = SCHOOL_COLORS[draft.school] ?? 'var(--arcane)'}
  <EditorPanel
    bind:tab={ed.tab}
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
      {@const pc = SCHOOL_COLORS[draft!.school] ?? 'var(--ink-muted)'}
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
      {#if ed.draft}
        <div class="edit-wrap" style="--mef-accent: {color}">
          <SpellEditForm bind:spell={ed.draft} />
        </div>
      {/if}
    {/snippet}
  </EditorPanel>
{:else}
  <!-- Fehler-Fallback wenn kein Draft (ungültiges JSON oder noch nicht geladen) -->
  <EditorPanel
    bind:tab={ed.tab}
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
        <button onclick={() => ed.tab = 'json'}>JSON bearbeiten</button>
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
    background: var(--bg);
    border: 1.5px solid var(--gold);
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 3px 16px rgba(0,0,0,0.23);
    display: flex;
    flex-direction: column;
    color: var(--ink);
    font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif;
    position: relative;
  }
  .spell-card::after {
    content: '';
    position: absolute;
    inset: 3px;
    border: 1px solid var(--gold);
    border-radius: 5px;
    pointer-events: none;
    z-index: 5;
  }

  .head {
    padding: 0.9rem 1.2rem 0.65rem;
    text-align: center;
    flex-shrink: 0;
    background: linear-gradient(to bottom,
      color-mix(in srgb, var(--c) 55%, var(--bg)) 0%,
      color-mix(in srgb, var(--c) 10%, var(--bg)) 100%);
  }
  .name {
    font-size: 1.05rem;
    font-weight: 700;
    font-variant: small-caps;
    color: var(--ink);
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
    color: color-mix(in srgb, var(--c) 80%, var(--ink));
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
      color-mix(in srgb, var(--c) 30%, var(--bg)) 0%,
      color-mix(in srgb, var(--c) 6%, var(--bg)) 100%);
  }
  .name-sm {
    font-size: 0.95rem;
    font-weight: 700;
    font-variant: small-caps;
    color: var(--ink);
  }
  .cont-lbl {
    font-size: 0.68rem;
    color: var(--ink-soft);
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
    color: var(--ink-muted);
    font-style: italic;
  }

  .desc {
    padding: 0.55rem 1.1rem;
    font-size: 0.82rem;
    line-height: 1.55;
    color: var(--ink);
    white-space: pre-wrap;
  }

  .higher {
    padding: 0 1.1rem 0.55rem;
    font-size: 0.77rem;
    line-height: 1.45;
    color: var(--ink-soft);
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
    border-top: 1px solid var(--gold);
    background: color-mix(in srgb, var(--c) 6%, var(--bg));
    font-size: 0.72rem;
    color: var(--ink-muted);
    font-style: italic;
    flex-shrink: 0;
  }
  .pdf-tab-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--ink-muted);
    cursor: pointer;
    font-size: 0.75rem;
    padding: 0.15rem 0.55rem;
    border-radius: 4px;
    font-family: inherit;
  }
  .pdf-tab-btn:hover {
    color: var(--ink);
    border-color: var(--ink-muted);
  }

  /* ── Bearbeiten-Container ── */
  .edit-wrap {
    background: var(--bg);
    border: 1px solid color-mix(in srgb, var(--mef-accent, var(--arcane)) 25%, var(--surface));
    border-radius: 6px;
    padding: 1rem 1.25rem;
    max-width: 560px;
    width: 100%;
  }

  .parse-error { color: var(--danger); font-size: 0.9rem; }
  .parse-error button {
    background: none; border: none; color: var(--red);
    cursor: pointer; text-decoration: underline; font-family: inherit;
  }
</style>
