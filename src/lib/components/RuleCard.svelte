<script lang="ts">
  import type { Rule } from '$lib/schemas/rule';
  import { parseRule } from '$lib/utils/schemaValidation';
  import { createLibraryCardEditor } from '$lib/editor/libraryCard';
  import { invalidateRulesCache } from '$lib/rulesLibrary';
  import RuleEditForm from './RuleEditForm.svelte';
  import EditorPanel from './EditorPanel.svelte';
  import CardParseError from './ui/CardParseError.svelte';
  import RuleCardView from './libraryView/RuleCardView.svelte';
  import CardEditWrap from './ui/CardEditWrap.svelte';

  const ed = createLibraryCardEditor<Rule>({
    type: 'rule',
    label: 'Regel',
    folder: 'rules',
    validate: parseRule,
    fallbackName: 'regel',
    invalidateCache: invalidateRulesCache,
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
    style="--ep-accent: var(--ink-soft)"
  >
    {#snippet karte()}
      <RuleCardView rule={draft!} />
    {/snippet}

    {#snippet bearbeiten()}
      {#if ed.draft}
        <CardEditWrap accent="var(--ink-soft)">
          <RuleEditForm bind:rule={ed.draft} />
        </CardEditWrap>
      {/if}
    {/snippet}
  </EditorPanel>
{:else}
  <CardParseError bind:tab={ed.tab} noun="Regel" json={ed.lastSavedContent} onsavejson={(json) => ed.saveJson(json)} />
{/if}
