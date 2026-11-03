<script lang="ts">
  import type { Trap } from '$lib/schemas/trap';
  import { parseTrap } from '$lib/utils/schemaValidation';
  import { createLibraryCardEditor } from '$lib/editor/libraryCard';
  import { invalidateTrapsCache } from '$lib/trapsLibrary';
  import TrapEditForm from './TrapEditForm.svelte';
  import EditorPanel from './EditorPanel.svelte';
  import CardParseError from './ui/CardParseError.svelte';
  import TrapCardView from './libraryView/TrapCardView.svelte';
  import CardEditWrap from './ui/CardEditWrap.svelte';

  const ed = createLibraryCardEditor<Trap>({
    type: 'trap',
    label: 'Falle',
    folder: 'traps',
    validate: parseTrap,
    fallbackName: 'falle',
    invalidateCache: invalidateTrapsCache,
  });

  let draft = $derived(ed.draft);
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
    style="--ep-accent: var(--danger)"
  >
    {#snippet karte()}
      <TrapCardView trap={draft!} />
    {/snippet}

    {#snippet bearbeiten()}
      {#if ed.draft}
        <CardEditWrap accent="var(--danger)">
          <TrapEditForm bind:trap={ed.draft} />
        </CardEditWrap>
      {/if}
    {/snippet}
  </EditorPanel>
{:else}
  <CardParseError bind:tab={ed.tab} noun="Falle" json={ed.lastSavedContent} onsavejson={(json) => ed.saveJson(json)} />
{/if}
