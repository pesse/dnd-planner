<script lang="ts">
  import type { Species } from '$lib/types';
  import type { Trait } from '$lib/schemas/species';
  import { parseSpecies as _parseSpecies } from '$lib/utils/schemaValidation';
  import SpeciesEditForm from './SpeciesEditForm.svelte';
  import EditorPanel from './EditorPanel.svelte';
  import ParseError from './ui/ParseError.svelte';
  import CardTools from './ui/CardTools.svelte';
  import Markdown from './Markdown.svelte';
  import TranslateModal from './TranslateModal.svelte';
  import { translateRule } from '$lib/services/aiActions/translateAction';
  import type { RuleTranslation } from '$lib/schemas/translation';
  import { createCardEditor } from '$lib/editor/cardEditor.svelte';
  import { slugKeepUmlauts } from '$lib/utils/text';
  import { invalidateVault } from '$lib/stores/campaign';
  import { invalidateSpeciesCache } from '$lib/speciesLibrary';
  import { declarationCoverage, coverageBadge } from '$lib/services/declarationCoverage';
  import DeclarationBadge from './DeclarationBadge.svelte';

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
    defaultName: (s) => slugKeepUmlauts(s.nameDe || s.name || 'spezies'),
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
            <DeclarationBadge badge={declBadge} />
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
        <CardTools accent="var(--green)" actions={[{ label: '🌐 Übersetzen…', onclick: () => (showTranslate = true) }]} />
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
      <ParseError message="Kein gültiger Spezies-Datensatz." />
    {/snippet}
    {#snippet bearbeiten()}
      <ParseError message="Ungültiges Spezies-JSON." onjson={() => (ed.tab = 'json')} />
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
</style>
