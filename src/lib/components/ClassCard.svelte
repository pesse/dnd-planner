<script lang="ts">
  import type { ClassProgression } from '$lib/types';
  import { parseClass } from '$lib/utils/schemaValidation';
  import ClassEditForm from './ClassEditForm.svelte';
  import EditorPanel from './EditorPanel.svelte';
  import CardParseError from './ui/CardParseError.svelte';
  import ClassCardView from './libraryView/ClassCardView.svelte';
  import EntryArtTab from './libraryView/EntryArtTab.svelte';
  import CardEditWrap from './ui/CardEditWrap.svelte';
  import CardTools from './ui/CardTools.svelte';
  import TranslateModal from './TranslateModal.svelte';
  import { translateRule } from '$lib/services/aiActions/translateAction';
  import type { RuleTranslation } from '$lib/schemas/translation';
  import { createLibraryCardEditor } from '$lib/editor/libraryCard';
  import { invalidateClassCache } from '$lib/classLibrary';
  import { declarationCoverage, coverageBadge } from '$lib/services/declarationCoverage';
  import DeclarationBadge from './DeclarationBadge.svelte';

  const ed = createLibraryCardEditor<ClassProgression>({
    type: 'class',
    label: 'Klasse',
    folder: 'classes',
    validate: parseClass,
    fallbackName: 'klasse',
    invalidateCache: invalidateClassCache,
  });

  let draft = $derived(ed.draft);

  // Eine Subklasse ist eine eigene Progression und zählt mit ihrer eigenen Merkmalsliste.
  let coverage = $derived(declarationCoverage(draft?.features ?? []));
  let declBadge = $derived(coverageBadge(coverage));

  let showTranslate = $state(false);

  function buildTranslationRun() {
    const c = ed.draft;
    if (!c) return null;
    const payload = {
      name: c.name,
      features: c.features.map((f) => ({ name: f.name, desc: f.desc })),
    };
    if (!payload.name && !payload.features.length) return null;
    return translateRule(payload);
  }

  /** Leere Felder bedeuten „nicht übersetzt" und bleiben unangetastet. */
  function applyTranslation(t: RuleTranslation) {
    const c = ed.draft;
    if (!c) return;
    if (t.name_de) c.nameDe = t.name_de;
    t.features.forEach((tf, i) => {
      if (!c.features[i]) return;
      if (tf.nameDe) c.features[i].nameDe = tf.nameDe;
      if (tf.descDe) c.features[i].descDe = tf.descDe;
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
    style="--ep-accent: var(--copper)"
  >
    {#snippet karte()}
      <ClassCardView klass={draft!}>
        {#snippet badge()}
          {#if coverage.total}<DeclarationBadge badge={declBadge} />{/if}
        {/snippet}
      </ClassCardView>
    {/snippet}

    {#snippet bearbeiten()}
      {#if ed.draft}
        <CardEditWrap accent="var(--copper)">
          <ClassEditForm bind:klass={ed.draft} />
        </CardEditWrap>
        <CardTools accent="var(--copper)" actions={[{ label: '🌐 Übersetzen…', onclick: () => (showTranslate = true) }]} />
      {/if}
    {/snippet}

    {#snippet extra()}
      <EntryArtTab kind={draft!.subclassOf ? 'subclass' : 'class'} entryKey={draft!.key} />
    {/snippet}
  </EditorPanel>
{:else}
  <CardParseError bind:tab={ed.tab} noun="Klassen" json={ed.lastSavedContent} onsavejson={(json) => ed.saveJson(json)} />
{/if}

{#if showTranslate && ed.draft}
  <TranslateModal
    entityName={ed.draft.nameDe || ed.draft.name || 'Klasse'}
    build={buildTranslationRun}
    onresult={applyTranslation}
    onclose={() => (showTranslate = false)}
  />
{/if}
