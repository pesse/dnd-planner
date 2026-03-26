<script lang="ts">
  import Sidebar from '$lib/components/Sidebar.svelte';
  import MarkdownEditor from '$lib/components/MarkdownEditor.svelte';
  import MarkdownViewer from '$lib/components/MarkdownViewer.svelte';
  import CharacterSheet from '$lib/components/CharacterSheet.svelte';
  import LlmPanel from '$lib/components/LlmPanel.svelte';
  import { fileContent, activeFile } from '$lib/stores/campaign';
  import { invoke } from '@tauri-apps/api/core';
  import { onMount } from 'svelte';

  let showPreview = $state(true);

  let isPdfCharacter = $derived(
    $activeFile?.type === 'character' && !!$activeFile?.dirPath
  );

  onMount(async () => {
    const cwd = await invoke<string>('get_current_dir');
    console.log('Tauri CWD:', cwd);
  });
</script>

<div class="app">
  <Sidebar />

  <div class="main">
    {#if isPdfCharacter}
      <CharacterSheet dirPath={$activeFile!.dirPath!} />
    {:else}
      <div class="toolbar">
        <button
          class:active={!showPreview}
          onclick={() => (showPreview = false)}
        >Editor</button>
        <button
          class:active={showPreview}
          onclick={() => (showPreview = true)}
        >Vorschau</button>
      </div>

      <div class="content">
        {#if showPreview}
          <MarkdownViewer />
        {:else}
          <MarkdownEditor />
        {/if}
      </div>
    {/if}
  </div>

  <LlmPanel />
</div>

<style>
  :global(*, *::before, *::after) {
    box-sizing: border-box;
  }

  :global(body) {
    margin: 0;
    padding: 0;
    background: #1e1e2e;
    font-family: Inter, system-ui, sans-serif;
  }

  .app {
    display: flex;
    height: 100vh;
    overflow: hidden;
  }

  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .toolbar {
    display: flex;
    gap: 0.25rem;
    padding: 0.5rem 1rem;
    background: #181825;
    border-bottom: 1px solid #313244;
  }

  .toolbar button {
    background: none;
    border: 1px solid #313244;
    border-radius: 4px;
    color: #6c7086;
    padding: 0.25rem 0.75rem;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .toolbar button.active {
    background: #313244;
    color: #cdd6f4;
  }

  .content {
    flex: 1;
    display: flex;
    min-height: 0;
    overflow: hidden;
  }
</style>
