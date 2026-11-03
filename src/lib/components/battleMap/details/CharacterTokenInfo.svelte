<script lang="ts">
  /** Spielerfigur im Kartenpanel: Kurzkarte, Tisch-Block und der volle Bogen als Popup über der Karte. */
  import { invoke } from '@tauri-apps/api/core';
  import type { Character } from '../../../schemas/characterSchema';
  import { parseCharacter } from '../../../utils/schemaValidation';
  import { createFormLibraries } from '../../../services/characterFormLibraries.svelte';
  import { createCharacterSheetModel } from '../../../services/characterSheetModel.svelte';
  import { createCharacterSideFiles } from '../../../services/characterSideFiles.svelte';
  import { characterEntry } from '../../../services/battleMap/tokenDetails';
  import CharacterPeekCard from '../../character/CharacterPeekCard.svelte';
  import ModelSheetView from '../../character/ModelSheetView.svelte';
  import CharacterTableBlock from './CharacterTableBlock.svelte';

  let { uid, name }: { uid: string; name: string } = $props();

  const entry = $derived(characterEntry(uid, name));
  let character = $state<Character | null>(null);
  let failed = $state(false);
  let sheetOpen = $state(false);

  $effect(() => {
    const path = entry.path;
    character = null;
    failed = false;
    let live = true;
    invoke<string>('read_file_content', { path })
      .then((raw) => {
        if (!live) return;
        const r = parseCharacter(JSON.parse(raw));
        if (r.ok) character = r.data;
        else failed = true;
      })
      .catch(() => live && (failed = true));
    return () => { live = false; };
  });

  const libs = createFormLibraries();
  const model = createCharacterSheetModel(() => character, libs);
  const side = createCharacterSideFiles({
    dirPath: () => entry.dirPath!,
    characterName: () => character?.name ?? '',
    portraitFile: () => character?.portraitFile,
    companionImageFile: () => character?.companion?.imageFile,
    figureFile: () => character?.figureFile,
  });
</script>

<svelte:window onkeydown={(e) => sheetOpen && e.key === 'Escape' && (sheetOpen = false)} />

{#if character}
  <CharacterPeekCard {character} dirPath={entry.dirPath!} />
  <div class="actions">
    <button onclick={() => (sheetOpen = true)}>📜 Bogen ansehen</button>
  </div>
  <CharacterTableBlock {character} {model} />

  {#if sheetOpen}
    <div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && (sheetOpen = false)}>
      <div class="popup" role="dialog" aria-modal="true" aria-label="Bogen von {character.name}">
        <header>
          <h2>{character.name}</h2>
          <button onclick={() => (sheetOpen = false)} title="Schließen (Esc)">✕</button>
        </header>
        <div class="popup-body">
          <ModelSheetView {model} companionImageUrl={side.companionImageUrl} figureUrl={side.figureUrl} />
        </div>
      </div>
    </div>
  {/if}
{:else}
  <p class="status">{failed ? 'Den Charakter gibt es nicht mehr.' : 'Lade …'}</p>
{/if}

<style>
  .actions {
    display: flex;
    gap: 0.4rem;
    padding: 0 1rem 0.6rem;
  }
  .actions button {
    padding: 0.2rem 0.6rem;
    font-size: 0.8rem;
    color: var(--ink-soft);
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
  }
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 8000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(10, 6, 2, 0.55);
  }
  .popup {
    display: flex;
    flex-direction: column;
    width: min(1100px, 94vw);
    height: 90vh;
    background: var(--bg);
    border: 1px solid var(--gold);
    border-radius: 8px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--border);
  }
  h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.2rem;
    color: var(--arcane);
  }
  header button {
    font-size: 1rem;
    background: none;
    border: none;
    color: var(--ink-soft);
    cursor: pointer;
  }
  .popup-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
  .status {
    padding: 1rem;
    color: var(--ink-muted);
    font-style: italic;
  }
</style>
