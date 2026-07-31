<script lang="ts">
  import type { Feat } from '$lib/types';
  import { parseFeat as _parseFeat } from '$lib/utils/schemaValidation';
  import FeatEditForm from './FeatEditForm.svelte';
  import EditorPanel from './EditorPanel.svelte';
  import Markdown from './Markdown.svelte';
  import TranslateModal from './TranslateModal.svelte';
  import { translateFeat } from '$lib/services/aiActions/translateAction';
  import type { FeatTranslation } from '$lib/schemas/translation';
  import { createCardEditor } from '$lib/editor/cardEditor.svelte';
  import { slugify } from '$lib/editor/saveAs';
  import { invalidateVault } from '$lib/stores/campaign';
  import { invalidateFeatsCache, FEAT_CATEGORY_DE } from '$lib/featsLibrary';
  import { declarationCoverage, coverageBadge } from '$lib/services/declarationCoverage';
  import DeclarationBadge from './DeclarationBadge.svelte';

  function parseFeat(json: string): Feat | null {
    try {
      const result = _parseFeat(JSON.parse(json));
      return result.ok ? result.data : null;
    } catch { return null; }
  }

  const ed = createCardEditor<Feat>({
    type: 'feat',
    label: 'Talent',
    parse: parseFeat,
    defaultName: (f) => slugify(f.nameDe || f.name || 'talent'),
    location: {
      resolvePath: (_f, name) => `./vault/feats/${name}.json`,
    },
    onSaved: () => { invalidateFeatsCache(); invalidateVault(); },
  });

  let draft = $derived(ed.draft);
  let dirty = $derived(ed.dirty);
  let saveError = $derived(ed.saveError);
  let lastSavedContent = $derived(ed.lastSavedContent);
  const save = () => ed.save();
  const discard = () => ed.discard();
  const saveJson = (json: string) => ed.saveJson(json);

  const prereq = (f: Feat): string => f.prerequisiteDe || f.prerequisite;
  const desc = (f: Feat): string => f.descDe || f.desc;

  // Ein Talent IST das Merkmal — die Abdeckung ist hier ein Ja/Nein, kein Zähler.
  let declBadge = $derived(coverageBadge(declarationCoverage(draft ? [draft] : [])));

  // ── Übersetzung ─────────────────────────────────────────────────────────────
  let showTranslate = $state(false);

  /** Baut den Übersetzungslauf; null, wenn es nichts zu übersetzen gibt. */
  function buildTranslationRun() {
    const f = ed.draft;
    if (!f) return null;
    const payload: Record<string, string> = {};
    if (f.name) payload.name = f.name;
    if (f.prerequisite) payload.prerequisite = f.prerequisite;
    if (f.desc) payload.desc = f.desc;
    if (!Object.keys(payload).length) return null;
    return translateFeat(payload);
  }

  /** Übernimmt die Übersetzung; leere Felder bedeuten „nicht übersetzt" und bleiben unangetastet. */
  function applyTranslation(t: FeatTranslation) {
    const f = ed.draft;
    if (!f) return;
    if (t.name_de) f.nameDe = t.name_de;
    if (t.prerequisite_de) f.prerequisiteDe = t.prerequisite_de;
    if (t.desc_de) f.descDe = t.desc_de;
  }
</script>

{#if draft}
  <EditorPanel
    bind:tab={ed.tab}
    {dirty}
    {saveError}
    onsave={save}
    ondiscard={discard}
    onsavejson={saveJson}
    getJson={() => draft ? JSON.stringify(draft, null, 2) : lastSavedContent}
    style="--ep-accent: var(--gold)"
  >
    {#snippet karte()}
      <div class="feat-card">
        <div class="head">
          <div class="name">{draft!.nameDe || draft!.name}</div>
          {#if draft!.nameDe && draft!.name && draft!.nameDe !== draft!.name}
            <div class="name-en">{draft!.name}</div>
          {/if}
          <div class="badges">
            <span class="kategorie">{FEAT_CATEGORY_DE[draft!.category]}</span>
            <DeclarationBadge badge={declBadge} />
          </div>
          {#if prereq(draft!)}
            <div class="meta">Voraussetzung: {prereq(draft!)}</div>
          {/if}
        </div>
        {#if desc(draft!)}
          <div class="body"><Markdown source={desc(draft!)} /></div>
        {:else}
          <p class="empty">Keine Beschreibung.</p>
        {/if}
      </div>
    {/snippet}

    {#snippet bearbeiten()}
      {#if ed.draft}
        <div class="edit-wrap">
          <FeatEditForm bind:feat={ed.draft} />
        </div>
        <div class="ai-section">
          <span class="ai-label">Werkzeuge</span>
          <div class="ai-row">
            <button class="ai-btn" onclick={() => (showTranslate = true)}>🌐 Übersetzen…</button>
          </div>
        </div>
      {/if}
    {/snippet}
  </EditorPanel>
{:else}
  <EditorPanel
    bind:tab={ed.tab}
    dirty={false}
    onsavejson={saveJson}
    getJson={() => lastSavedContent}
  >
    {#snippet karte()}
      <p class="parse-error">Kein gültiger Talent-Datensatz.</p>
    {/snippet}
    {#snippet bearbeiten()}
      <p class="parse-error">
        Ungültiges Talent-JSON.
        <button onclick={() => ed.tab = 'json'}>JSON bearbeiten</button>
      </p>
    {/snippet}
  </EditorPanel>
{/if}

{#if showTranslate && ed.draft}
  <TranslateModal
    entityName={ed.draft.nameDe || ed.draft.name || 'Talent'}
    build={buildTranslationRun}
    onresult={applyTranslation}
    onclose={() => (showTranslate = false)}
  />
{/if}

<style>
  .feat-card {
    width: 100%; max-width: 560px; background: var(--bg);
    border: 1.5px solid var(--gold); border-radius: 8px;
    color: var(--ink); font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif;
    overflow: hidden;
  }
  .head {
    padding: 0.9rem 1.2rem; text-align: center;
    background: linear-gradient(to bottom,
      color-mix(in srgb, var(--gold) 40%, var(--bg)) 0%,
      color-mix(in srgb, var(--gold) 8%, var(--bg)) 100%);
  }
  .name { font-size: 1.3rem; font-weight: 700; font-variant: small-caps; letter-spacing: 0.02em; }
  .name-en { font-size: 0.85rem; font-style: italic; color: var(--ink-soft); }
  .badges {
    display: flex; flex-wrap: wrap; gap: 0.35rem; justify-content: center; margin-top: 0.35rem;
  }
  .kategorie {
    font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--ink-soft); border: 1px solid color-mix(in srgb, var(--gold) 45%, var(--bg));
    border-radius: 3px; padding: 0.05rem 0.4rem;
  }

  /* Deklarations-Abdeckung: Gold = es liegt noch Redaktionsarbeit an, Grün = vollständig. */
  .meta { font-size: 0.8rem; color: color-mix(in srgb, var(--gold) 70%, var(--ink)); margin-top: 0.2rem; font-style: italic; }

  .body { padding: 0.7rem 1.2rem 1rem; font-size: 0.85rem; line-height: 1.55; }
  .empty { padding: 1rem; color: var(--ink-muted); font-style: italic; }

  .edit-wrap {
    background: var(--bg);
    border: 1px solid color-mix(in srgb, var(--gold) 25%, var(--surface));
    border-radius: 6px; padding: 1rem 1.25rem; max-width: 560px; width: 100%;
    --mef-accent: var(--gold);
  }

  .ai-section {
    display: flex; flex-direction: column; align-items: flex-start; gap: 0.45rem;
    width: 100%; max-width: 560px; margin-top: 0.6rem; padding-top: 0.6rem;
    border-top: 1px solid var(--surface);
  }
  .ai-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-muted); }
  .ai-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .ai-btn {
    background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
    color: var(--ink); padding: 0.3rem 0.7rem; cursor: pointer; font-size: 0.82rem; font-family: inherit;
  }
  .ai-btn:hover { border-color: var(--gold); color: var(--gold); }

  .parse-error { color: var(--danger); font-size: 0.9rem; }
  .parse-error button {
    background: none; border: none; color: var(--red);
    cursor: pointer; text-decoration: underline; font-family: inherit;
  }
</style>
