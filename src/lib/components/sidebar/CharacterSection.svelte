<script lang="ts">
  import { untrack } from 'svelte';
  import { activeFile } from '../../stores/campaign';
  import CharacterWizard from '../CharacterWizard.svelte';
  import SectionHeader from './SectionHeader.svelte';
  import { createCharacterSectionState, CHARACTERS_PATH } from './characterSectionState.svelte';
  import './tree.css';

  const state = createCharacterSectionState();

  // `untrack` verhindert ein Re-Expandieren, wenn der Nutzer manuell zuklappt.
  $effect(() => {
    const path = $activeFile?.path;
    if (!path?.startsWith(`${CHARACTERS_PATH}/`)) return;
    untrack(() => {
      if (!state.expanded) { state.expanded = true; state.load(); }
    });
  });

  export async function reload() {
    await state.reload();
  }
</script>

<div class="top-section">
  <SectionHeader label="Charaktere" expanded={state.expanded} ontoggle={() => state.toggle()} top>
    {#snippet actions()}
      <button class="add-btn" title="Neuer Charakter" onclick={() => (state.showWizard = true)}>
        +
      </button>
    {/snippet}
  </SectionHeader>

  {#if state.expanded}
    <div class="file-list">
      {#if state.entries.length}
        {#each state.entries as entry}
          {@const meta = state.meta[entry.name]}
          <div class="entry-row">
            <button
              class="file-entry"
              class:char-entry={!!meta}
              class:active={entry.is_dir
                ? $activeFile?.dirPath === `${CHARACTERS_PATH}/${entry.name}`
                : $activeFile?.path === `${CHARACTERS_PATH}/${entry.name}`}
              onclick={() => state.openCharacter(entry)}
            >
              {#if meta}
                <span class="char-classes">
                  {#each meta.classes as cls}
                    <span class="char-class-icon" title="{cls.label}{cls.level !== null ? ` ${cls.level}` : ''}">
                      {cls.icon}
                      {#if cls.level !== null}<span class="char-level-badge">{cls.level}</span>{/if}
                    </span>
                  {/each}
                </span>
                {meta.name}
              {:else}
                {entry.name.replace('.md', '')}
              {/if}
            </button>
            <button
              class="entry-del"
              title="Löschen"
              onclick={(e) => { e.stopPropagation(); state.deleteCharacter(entry); }}
            >🗑</button>
          </div>
        {/each}
      {:else if !state.showNewInput}
        <span class="empty">Keine Charaktere</span>
      {/if}

      {#if state.showNewInput}
        <div class="new-file-row">
          <input
            class="new-file-input"
            bind:value={state.newInput}
            placeholder="Name…"
            onkeydown={(e) => { state.createCharacter(e); state.cancelNewCharacter(e); }}
            autofocus
          />
          <button class="confirm-btn" onclick={(e) => state.createCharacter(e)}>✓</button>
        </div>
      {/if}
    </div>
  {/if}
</div>

{#if state.showWizard}
  <CharacterWizard onComplete={(c) => state.createFromWizard(c)} onCancel={() => (state.showWizard = false)} />
{/if}

<style>
  .char-classes {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    margin-right: 0.45rem;
    vertical-align: middle;
  }
  .char-class-icon {
    position: relative;
    display: inline-block;
    font-size: 0.9rem;
    line-height: 1;
  }
  .char-level-badge {
    position: absolute;
    top: -0.45em;
    right: -0.4em;
    min-width: 0.7rem;
    padding: 0 0.12rem;
    border-radius: 0.55rem;
    background: var(--bg-deep);
    border: 1px solid var(--border);
    color: var(--ink-soft);
    font-size: 0.5rem;
    font-weight: 600;
    text-align: center;
    line-height: 0.72rem;
  }

</style>
