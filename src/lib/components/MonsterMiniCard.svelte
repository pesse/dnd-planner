<script lang="ts">
  import { createMonsterMiniCardState } from './monster/monsterMiniCardState.svelte';
  import MonsterCompactView from './monster/MonsterCompactView.svelte';
  import MonsterEditForm from './MonsterEditForm.svelte';
  import './monster/monsterMiniCard.css';

  let { slug, actMonsterBasePath }: { slug: string; actMonsterBasePath?: string } = $props();

  const state = createMonsterMiniCardState(() => slug, () => actMonsterBasePath);
</script>

<div class="mini-card" class:edit-mode={state.editMode} class:act-local={state.source === 'act'}>
  {#if state.status === 'loading'}
    <div class="mini-placeholder">…</div>

  {:else if state.status === 'missing'}
    <div class="mini-missing">
      <span class="missing-slug">{slug}</span>
      <span class="missing-note">{state.loadError || 'nicht in Bibliothek'}</span>
    </div>

  {:else if state.saved && state.draft}
    {#if state.editMode}
      <div class="edit-header">
        <span class="source-badge source-{state.source}">{state.source === 'act' ? 'akt-lokal' : 'bibliothek'}</span>
        {#if state.dirty}
          <button class="save-btn" onclick={() => state.save()}>Speichern</button>
          {#if state.saveError}<span class="save-error">{state.saveError}</span>{/if}
        {/if}
        <button class="cancel-btn" onclick={() => state.cancelEdit()}>{state.dirty ? 'Verwerfen' : 'Schließen'}</button>
      </div>

      <div class="sb-full">
        <MonsterEditForm bind:monster={state.draft} onchange={() => state.mark()} />
      </div>

    {:else}
      <MonsterCompactView
        monster={state.saved}
        source={state.source}
        canEditLocally={!!actMonsterBasePath}
        schemaWarnings={state.schemaWarnings}
        promoteError={state.promoteError}
        onedit={() => state.startEdit()}
        onpromote={() => state.promoteToLibrary()}
      />
    {/if}
  {/if}
</div>
