<script lang="ts">
  import Sidebar from '$lib/components/Sidebar.svelte';
  import MarkdownEditor from '$lib/components/MarkdownEditor.svelte';
  import MarkdownViewer from '$lib/components/MarkdownViewer.svelte';
  import CharacterSheet from '$lib/components/CharacterSheet.svelte';
  import LlmPanel from '$lib/components/LlmPanel.svelte';
  import StructureHint from '$lib/components/StructureHint.svelte';
  import { fileContent, activeFile, historyState, undoContent, redoContent } from '$lib/stores/campaign';
  import { invoke } from '@tauri-apps/api/core';
  import { onMount } from 'svelte';

  let showPreview = $state(true);

  let isPdfCharacter = $derived(
    $activeFile?.type === 'character' && !!$activeFile?.dirPath
  );

  const MIN_W = 140;
  const MAX_SIDEBAR = 520;
  const MAX_LLM = 760;

  let sidebarWidth = $state(parseInt(localStorage.getItem('sidebar-width') ?? '220'));
  let llmWidth = $state(parseInt(localStorage.getItem('llm-width') ?? '460'));

  function startResize(side: 'sidebar' | 'llm', e: MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = side === 'sidebar' ? sidebarWidth : llmWidth;

    function onMove(mv: MouseEvent) {
      const delta = mv.clientX - startX;
      if (side === 'sidebar') {
        sidebarWidth = Math.max(MIN_W, Math.min(MAX_SIDEBAR, startW + delta));
      } else {
        // LLM-Panel ist rechts — nach links ziehen vergrößert
        llmWidth = Math.max(MIN_W, Math.min(MAX_LLM, startW - delta));
      }
    }

    function onUp() {
      localStorage.setItem('sidebar-width', String(sidebarWidth));
      localStorage.setItem('llm-width', String(llmWidth));
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  onMount(async () => {
    const cwd = await invoke<string>('get_current_dir');
    console.log('Tauri CWD:', cwd);
  });
</script>

<div class="app">
  <div class="panel-wrap" style="width: {sidebarWidth}px">
    <Sidebar />
  </div>

  <div
    class="resize-handle"
    role="separator"
    aria-label="Sidebar-Breite ändern"
    onmousedown={(e) => startResize('sidebar', e)}
  ></div>

  <div class="main">
    {#if isPdfCharacter}
      <CharacterSheet dirPath={$activeFile!.dirPath!} />
    {:else}
      <div class="toolbar">
        <button class:active={!showPreview} onclick={() => (showPreview = false)}>Editor</button>
        <button class:active={showPreview} onclick={() => (showPreview = true)}>Vorschau</button>
        <div class="toolbar-sep"></div>
        <button
          class="history-btn"
          onclick={undoContent}
          disabled={!$historyState.canUndo}
          title="Rückgängig (Ctrl+Z)"
        >↩</button>
        <button
          class="history-btn"
          onclick={redoContent}
          disabled={!$historyState.canRedo}
          title="Wiederherstellen (Ctrl+Y)"
        >↪</button>
      </div>

      <StructureHint />

      <div class="content">
        {#if showPreview}
          <MarkdownViewer />
        {:else}
          <MarkdownEditor />
        {/if}
      </div>
    {/if}
  </div>

  <div
    class="resize-handle"
    role="separator"
    aria-label="LLM-Panel-Breite ändern"
    onmousedown={(e) => startResize('llm', e)}
  ></div>

  <div class="panel-wrap" style="width: {llmWidth}px">
    <LlmPanel />
  </div>
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

  .panel-wrap {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  .resize-handle {
    width: 4px;
    flex-shrink: 0;
    background: #313244;
    cursor: col-resize;
    transition: background 0.15s;
    position: relative;
    z-index: 10;
  }

  .resize-handle:hover,
  .resize-handle:active {
    background: #89b4fa;
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

  .toolbar-sep {
    flex: 1;
  }

  .history-btn {
    font-size: 1rem;
    padding: 0.25rem 0.5rem;
  }

  .history-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .content {
    flex: 1;
    display: flex;
    min-height: 0;
    overflow: hidden;
  }
</style>
