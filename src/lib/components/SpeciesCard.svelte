<script lang="ts">
  import type { Species } from '$lib/types';
  import type { Trait } from '$lib/schemas/species';
  import { parseSpecies } from '$lib/utils/schemaValidation';
  import SpeciesEditForm from './SpeciesEditForm.svelte';
  import EditorPanel from './EditorPanel.svelte';
  import CardParseError from './ui/CardParseError.svelte';
  import LibraryCardFrame from './ui/LibraryCardFrame.svelte';
  import CardEditWrap from './ui/CardEditWrap.svelte';
  import CardTools from './ui/CardTools.svelte';
  import Markdown from './Markdown.svelte';
  import TranslateModal from './TranslateModal.svelte';
  import { translateRule } from '$lib/services/aiActions/translateAction';
  import type { RuleTranslation } from '$lib/schemas/translation';
  import { createLibraryCardEditor } from '$lib/editor/libraryCard';
  import { invalidateSpeciesCache } from '$lib/speciesLibrary';
  import { declarationCoverage, coverageBadge } from '$lib/services/declarationCoverage';
  import DeclarationBadge from './DeclarationBadge.svelte';

  const ed = createLibraryCardEditor<Species>({
    type: 'species',
    label: 'Spezies',
    folder: 'species',
    validate: parseSpecies,
    fallbackName: 'spezies',
    invalidateCache: invalidateSpeciesCache,
  });

  let draft = $derived(ed.draft);

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
    dirty={ed.dirty}
    saveError={ed.saveError}
    onsave={() => ed.save()}
    ondiscard={() => ed.discard()}
    onsavejson={(json) => ed.saveJson(json)}
    getJson={() => draft ? JSON.stringify(draft, null, 2) : ed.lastSavedContent}
    style="--ep-accent: var(--green)"
  >
    {#snippet karte()}
      <LibraryCardFrame accent="var(--green)" name={draft!.name} nameDe={draft!.nameDe}>
        {#snippet head()}
          <div class="meta">
            {#if draft!.size}Größe: {draft!.size}{/if}
            {#if draft!.size && draft!.speed} · {/if}
            {#if draft!.speed}Geschwindigkeit: {draft!.speed}{/if}
          </div>
          {#if coverage.total}
            <DeclarationBadge badge={declBadge} />
          {/if}
        {/snippet}
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
      </LibraryCardFrame>
    {/snippet}

    {#snippet bearbeiten()}
      {#if ed.draft}
        <CardEditWrap accent="var(--green)">
          <SpeciesEditForm bind:species={ed.draft} />
        </CardEditWrap>
        <CardTools accent="var(--green)" actions={[{ label: '🌐 Übersetzen…', onclick: () => (showTranslate = true) }]} />
      {/if}
    {/snippet}
  </EditorPanel>
{:else}
  <CardParseError bind:tab={ed.tab} noun="Spezies" json={ed.lastSavedContent} onsavejson={(json) => ed.saveJson(json)} />
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
  .meta { font-size: 0.8rem; color: color-mix(in srgb, var(--green) 70%, var(--ink)); margin-top: 0.2rem; }

  .features { padding: 0.6rem 1.2rem 1rem; display: flex; flex-direction: column; gap: 0.7rem; }
  .feature-name { font-weight: 700; font-variant: small-caps; color: var(--green); }
  .feature-desc { font-size: 0.85rem; line-height: 1.55; margin-top: 0.15rem; }
  .empty { padding: 1rem; color: var(--ink-muted); font-style: italic; }
</style>
