<script lang="ts">
  import type { Feat } from '$lib/types';
  import { parseFeat } from '$lib/utils/schemaValidation';
  import FeatEditForm from './FeatEditForm.svelte';
  import EditorPanel from './EditorPanel.svelte';
  import CardParseError from './ui/CardParseError.svelte';
  import FeatCardView from './libraryView/FeatCardView.svelte';
  import CardEditWrap from './ui/CardEditWrap.svelte';
  import CardTools from './ui/CardTools.svelte';
  import TranslateModal from './TranslateModal.svelte';
  import { translateFeat } from '$lib/services/aiActions/translateAction';
  import type { FeatTranslation } from '$lib/schemas/translation';
  import { createLibraryCardEditor } from '$lib/editor/libraryCard';
  import { invalidateFeatsCache } from '$lib/featsLibrary';
  import { declarationCoverage, coverageBadge } from '$lib/services/declarationCoverage';
  import DeclarationBadge from './DeclarationBadge.svelte';

  const ed = createLibraryCardEditor<Feat>({
    type: 'feat',
    label: 'Talent',
    folder: 'feats',
    validate: parseFeat,
    fallbackName: 'talent',
    invalidateCache: invalidateFeatsCache,
  });

  let draft = $derived(ed.draft);

  // Ein Talent IST das Merkmal — die Abdeckung ist hier ein Ja/Nein, kein Zähler.
  let declBadge = $derived(coverageBadge(declarationCoverage(draft ? [draft] : [])));

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
    dirty={ed.dirty}
    saveError={ed.saveError}
    onsave={() => ed.save()}
    ondiscard={() => ed.discard()}
    onsavejson={(json) => ed.saveJson(json)}
    getJson={() => draft ? JSON.stringify(draft, null, 2) : ed.lastSavedContent}
    style="--ep-accent: var(--gold)"
  >
    {#snippet karte()}
      <FeatCardView feat={draft!}>
        {#snippet badges()}<DeclarationBadge badge={declBadge} />{/snippet}
      </FeatCardView>
    {/snippet}

    {#snippet bearbeiten()}
      {#if ed.draft}
        <CardEditWrap accent="var(--gold)">
          <FeatEditForm bind:feat={ed.draft} />
        </CardEditWrap>
        <CardTools accent="var(--gold)" actions={[{ label: '🌐 Übersetzen…', onclick: () => (showTranslate = true) }]} />
      {/if}
    {/snippet}
  </EditorPanel>
{:else}
  <CardParseError bind:tab={ed.tab} noun="Talent" json={ed.lastSavedContent} onsavejson={(json) => ed.saveJson(json)} />
{/if}

{#if showTranslate && ed.draft}
  <TranslateModal
    entityName={ed.draft.nameDe || ed.draft.name || 'Talent'}
    build={buildTranslationRun}
    onresult={applyTranslation}
    onclose={() => (showTranslate = false)}
  />
{/if}
