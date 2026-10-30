<script lang="ts">
  import type { Background } from '$lib/types';
  import { parseBackground } from '$lib/utils/schemaValidation';
  import BackgroundEditForm from './BackgroundEditForm.svelte';
  import EditorPanel from './EditorPanel.svelte';
  import CardParseError from './ui/CardParseError.svelte';
  import BackgroundCardView from './libraryView/BackgroundCardView.svelte';
  import EntryArtTab from './libraryView/EntryArtTab.svelte';
  import CardEditWrap from './ui/CardEditWrap.svelte';
  import CardTools from './ui/CardTools.svelte';
  import TranslateModal from './TranslateModal.svelte';
  import { translateBackground } from '$lib/services/aiActions/translateAction';
  import type { BackgroundTranslation } from '$lib/schemas/translation';
  import { createLibraryCardEditor } from '$lib/editor/libraryCard';
  import { navigateTo } from '$lib/services/navigation';
  import { invalidateBackgroundsCache } from '$lib/backgroundsLibrary';
  import type { FeatEntry } from '$lib/featsLibrary';

  const ed = createLibraryCardEditor<Background>({
    type: 'background',
    label: 'Hintergrund',
    folder: 'backgrounds',
    validate: parseBackground,
    fallbackName: 'hintergrund',
    invalidateCache: invalidateBackgroundsCache,
  });

  let draft = $derived(ed.draft);

  async function openFeatPage(feat: FeatEntry) {
    if (!feat.path) return;
    await navigateTo({
      name: feat.path.split('/').pop()!.replace('.json', ''),
      path: feat.path,
      type: 'feat',
    });
  }

  let showTranslate = $state(false);

  function buildTranslationRun() {
    const b = ed.draft;
    if (!b) return null;
    const payload: Record<string, unknown> = {
      benefits: b.benefits.map((x) => ({ name: x.name, desc: x.desc })),
    };
    if (b.name) payload.name = b.name;
    if (b.desc) payload.desc = b.desc;
    if (!b.name && !b.desc && !b.benefits.length) return null;
    return translateBackground(payload);
  }

  /** Leere Felder bedeuten „nicht übersetzt" und bleiben unangetastet. */
  function applyTranslation(t: BackgroundTranslation) {
    const b = ed.draft;
    if (!b) return;
    if (t.name_de) b.nameDe = t.name_de;
    if (t.desc_de) b.descDe = t.desc_de;
    t.benefits.forEach((bf, i) => {
      if (!b.benefits[i]) return;
      if (bf.nameDe) b.benefits[i].nameDe = bf.nameDe;
      if (bf.descDe) b.benefits[i].descDe = bf.descDe;
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
    extraTabs={[{ id: 'images', label: 'Bilder' }]}
    style="--ep-accent: var(--teal)"
  >
    {#snippet karte()}
      <BackgroundCardView background={draft!} onOpenFeat={openFeatPage} />
    {/snippet}

    {#snippet bearbeiten()}
      {#if ed.draft}
        <CardEditWrap accent="var(--teal)">
          <BackgroundEditForm bind:background={ed.draft} />
        </CardEditWrap>
        <CardTools accent="var(--teal)" actions={[{ label: '🌐 Übersetzen…', onclick: () => (showTranslate = true) }]} />
      {/if}
    {/snippet}

    {#snippet extra()}
      <EntryArtTab kind="background" entryKey={draft!.key ?? ''} />
    {/snippet}
  </EditorPanel>
{:else}
  <CardParseError bind:tab={ed.tab} noun="Hintergrund" json={ed.lastSavedContent} onsavejson={(json) => ed.saveJson(json)} />
{/if}

{#if showTranslate && ed.draft}
  <TranslateModal
    entityName={ed.draft.nameDe || ed.draft.name || 'Hintergrund'}
    build={buildTranslationRun}
    onresult={applyTranslation}
    onclose={() => (showTranslate = false)}
  />
{/if}
