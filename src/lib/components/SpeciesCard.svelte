<script lang="ts">
  import type { Species } from '$lib/types';
  import type { Trait } from '$lib/schemas/species';
  import { parseSpecies as _parseSpecies } from '$lib/utils/schemaValidation';
  import SpeciesEditForm from './SpeciesEditForm.svelte';
  import EditorPanel from './EditorPanel.svelte';
  import Markdown from './Markdown.svelte';
  import TranslateModal from './TranslateModal.svelte';
  import { translateRule } from '$lib/services/aiActions/translateAction';
  import type { RuleTranslation } from '$lib/schemas/translation';
  import { createCardEditor } from '$lib/editor/cardEditor.svelte';
  import { slugify } from '$lib/editor/saveAs';
  import { invalidateVault } from '$lib/stores/campaign';
  import { invalidateSpeciesCache } from '$lib/speciesLibrary';
  import { declarationCoverage, coverageBadge } from '$lib/services/declarationCoverage';

  function parseSpecies(json: string): Species | null {
    try {
      const result = _parseSpecies(JSON.parse(json));
      return result.ok ? result.data : null;
    } catch { return null; }
  }

  const ed = createCardEditor<Species>({
    type: 'species',
    label: 'Spezies',
    parse: parseSpecies,
    defaultName: (s) => slugify(s.nameDe || s.name || 'spezies'),
    location: {
      resolvePath: (_s, name) => `./vault/species/${name}.json`,
    },
    onSaved: () => { invalidateSpeciesCache(); invalidateVault(); },
  });

  let draft = $derived(ed.draft);
  let dirty = $derived(ed.dirty);
  let saveError = $derived(ed.saveError);
  let lastSavedContent = $derived(ed.lastSavedContent);
  const save = () => ed.save();
  const discard = () => ed.discard();
  const saveJson = (json: string) => ed.saveJson(json);

  const traitName = (t: Trait): string => t.nameDe || t.name;
  const traitDesc = (t: Trait): string => t.descDe || t.desc;

  let coverage = $derived(declarationCoverage(draft?.traits ?? []));
  let declBadge = $derived(coverageBadge(coverage));

  // ── Übersetzung ─────────────────────────────────────────────────────────────
  let showTranslate = $state(false);

  /** Baut den Übersetzungslauf; null, wenn es nichts zu übersetzen gibt. */
  function buildTranslationRun() {
    const s = ed.draft;
    if (!s) return null;
    const payload = {
      name: s.name,
      features: s.traits.map((t) => ({ name: t.name, desc: t.desc })),
    };
    if (!payload.name && !payload.features.length) return null;
    return translateRule(payload);
  }

  /** Übernimmt die Übersetzung; leere Felder bedeuten „nicht übersetzt" und bleiben unangetastet. */
  function applyTranslation(t: RuleTranslation) {
    const s = ed.draft;
    if (!s) return;
    if (t.name_de) s.nameDe = t.name_de;
    t.features.forEach((tf, i) => {
      if (!s.traits[i]) return;
      if (tf.nameDe) s.traits[i].nameDe = tf.nameDe;
      if (tf.descDe) s.traits[i].descDe = tf.descDe;
    });
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
    style="--ep-accent: var(--green)"
  >
    {#snippet karte()}
      <div class="species-card">
        <div class="head">
          <div class="name">{draft!.nameDe || draft!.name}</div>
          {#if draft!.nameDe && draft!.name && draft!.nameDe !== draft!.name}
            <div class="name-en">{draft!.name}</div>
          {/if}
          <div class="meta">
            {#if draft!.size}Größe: {draft!.size}{/if}
            {#if draft!.size && draft!.speed} · {/if}
            {#if draft!.speed}Geschwindigkeit: {draft!.speed}{/if}
          </div>
          {#if coverage.total}
            <div class="declaration {declBadge.tone}" title={declBadge.title}>{declBadge.text}</div>
          {/if}
        </div>
        {#if draft!.traits.length}
          <div class="features">
            {#each draft!.traits as t}
              <div class="feature">
                <div class="feature-name">{traitName(t)}</div>
                {#if traitDesc(t)}<div class="feature-desc"><Markdown source={traitDesc(t)} /></div>{/if}
              </div>
            {/each}
          </div>
        {:else}
          <p class="empty">Keine Merkmale.</p>
        {/if}
      </div>
    {/snippet}

    {#snippet bearbeiten()}
      {#if ed.draft}
        <div class="edit-wrap">
          <SpeciesEditForm bind:species={ed.draft} />
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
      <p class="parse-error">Kein gültiger Spezies-Datensatz.</p>
    {/snippet}
    {#snippet bearbeiten()}
      <p class="parse-error">
        Ungültiges Spezies-JSON.
        <button onclick={() => ed.tab = 'json'}>JSON bearbeiten</button>
      </p>
    {/snippet}
  </EditorPanel>
{/if}

{#if showTranslate && ed.draft}
  <TranslateModal
    entityName={ed.draft.nameDe || ed.draft.name || 'Spezies'}
    build={buildTranslationRun}
    onresult={applyTranslation}
    onclose={() => (showTranslate = false)}
  />
{/if}

<style>
  .species-card {
    width: 100%; max-width: 560px; background: var(--bg);
    border: 1.5px solid var(--green); border-radius: 8px;
    color: var(--ink); font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif;
    overflow: hidden;
  }
  .head {
    padding: 0.9rem 1.2rem; text-align: center;
    background: linear-gradient(to bottom,
      color-mix(in srgb, var(--green) 40%, var(--bg)) 0%,
      color-mix(in srgb, var(--green) 8%, var(--bg)) 100%);
  }
  .name { font-size: 1.3rem; font-weight: 700; font-variant: small-caps; letter-spacing: 0.02em; }
  .name-en { font-size: 0.85rem; font-style: italic; color: var(--ink-soft); }
  .meta { font-size: 0.8rem; color: color-mix(in srgb, var(--green) 70%, var(--ink)); margin-top: 0.2rem; }

  /* Deklarations-Abdeckung: Gold = es liegt noch Redaktionsarbeit an, Grün = vollständig. */
  .declaration {
    display: inline-block; margin-top: 0.35rem;
    font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em;
    border-radius: 3px; padding: 0.05rem 0.4rem;
  }
  .declaration.open {
    color: var(--gold); border: 1px solid color-mix(in srgb, var(--gold) 45%, var(--bg));
    background: color-mix(in srgb, var(--gold) 12%, var(--bg));
  }
  .declaration.done {
    color: var(--green); border: 1px solid color-mix(in srgb, var(--green) 40%, var(--bg));
    background: var(--bg);
  }

  .features { padding: 0.6rem 1.2rem 1rem; display: flex; flex-direction: column; gap: 0.7rem; }
  .feature-name { font-weight: 700; font-variant: small-caps; color: var(--green); }
  .feature-desc { font-size: 0.85rem; line-height: 1.55; margin-top: 0.15rem; }
  .empty { padding: 1rem; color: var(--ink-muted); font-style: italic; }

  .edit-wrap {
    background: var(--bg);
    border: 1px solid color-mix(in srgb, var(--green) 25%, var(--surface));
    border-radius: 6px; padding: 1rem 1.25rem; max-width: 560px; width: 100%;
    --mef-accent: var(--green);
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
  .ai-btn:hover { border-color: var(--green); color: var(--green); }

  .parse-error { color: var(--danger); font-size: 0.9rem; }
  .parse-error button {
    background: none; border: none; color: var(--red);
    cursor: pointer; text-decoration: underline; font-family: inherit;
  }
</style>
