<script lang="ts">
  import Sidebar from '$lib/components/Sidebar.svelte';
  import MarkdownEditor from '$lib/components/MarkdownEditor.svelte';
  import CharacterSheet from '$lib/components/CharacterSheet.svelte';
  import MonsterCard from '$lib/components/MonsterCard.svelte';
  import EncounterCard from '$lib/components/EncounterCard.svelte';
  import SpellCard from '$lib/components/SpellCard.svelte';
  import LlmPanel from '$lib/components/LlmPanel.svelte';
  import StructureHint from '$lib/components/StructureHint.svelte';
  import ErrorToast from '$lib/components/ErrorToast.svelte';
  import { pushError } from '$lib/stores/errors';
  import { fileContent, activeFile, activeCampaign, historyState, undoContent, redoContent, replaceContent, invalidateVault } from '$lib/stores/campaign';
  import { invoke } from '@tauri-apps/api/core';
  import { onMount } from 'svelte';
  import { marked } from 'marked';
  import { buildPrintHtmlMarkdown } from '$lib/utils/printEncounter';

  let isPdfCharacter = $derived(
    $activeFile?.type === 'character' && !!$activeFile?.dirPath
  );
  let isMonster = $derived($activeFile?.type === 'monster');
  let isEncounter = $derived($activeFile?.type === 'encounter');
  let isSpell = $derived($activeFile?.type === 'spell');

  let isMarkdownPrintable = $derived(
    $activeFile?.type === 'act' || $activeFile?.type === 'campaign' || $activeFile?.type === 'notes'
  );

  function openMarkdownPrint() {
    if (!$fileContent || !$activeFile) return;
    const campaign = $activeCampaign?.name ?? '';
    const docName = (() => {
      const match = $fileContent.match(/^#\s+(.+)$/m);
      return match ? match[1].trim() : $activeFile!.name.replace('.md', '');
    })();
    const typeLabel: Partial<Record<string, string>> = { campaign: 'Kampagne', act: 'Akt', notes: 'Notiz' };
    const label = typeLabel[$activeFile.type] ?? $activeFile.type;
    const title = $activeFile.type === 'campaign'
      ? `${campaign} – ${label}`
      : `${campaign} – ${label}: ${docName}`;
    const html = buildPrintHtmlMarkdown(title, marked($fileContent) as string);
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:none;visibility:hidden;';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument!;
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => {
      const prev = document.title;
      document.title = title;
      iframe.contentWindow!.focus();
      iframe.contentWindow!.print();
      document.title = prev;
      setTimeout(() => document.body.removeChild(iframe), 2000);
    }, 0);
  }

  // Titel aus dem Markdown-Inhalt extrahieren (erste # Zeile)
  let docTitle = $derived(() => {
    if (!$fileContent) return $activeFile?.name?.replace('.md', '') ?? '';
    const match = $fileContent.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : ($activeFile?.name?.replace('.md', '') ?? '');
  });

  // Rename-State
  let renaming = $state(false);
  let renameValue = $state('');

  function startRename() {
    if ($activeFile?.type === 'campaign') {
      renameValue = $activeCampaign?.name ?? '';
    } else {
      renameValue = $activeFile?.name?.replace('.md', '') ?? '';
    }
    renaming = true;
  }

  async function commitRename() {
    if (!renaming) return;
    renaming = false;
    const file = $activeFile;
    if (!file || !renameValue.trim()) return;

    if (file.type === 'campaign') {
      const newName = renameValue.trim();
      const newSlug = newName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-äöüß]/g, '');
      const campaign = $activeCampaign;
      if (!campaign || newSlug === campaign.path) return;

      const oldFolder = `./vault/campaigns/${campaign.path}`;
      const newFolder = `./vault/campaigns/${newSlug}`;
      const newFilePath = `${newFolder}/campaign.md`;

      try {
        await invoke('rename_file', { oldPath: oldFolder, newPath: newFolder });
        activeCampaign.set({ ...campaign, path: newSlug, name: newName });
        activeFile.set({ ...file, path: newFilePath });
        invalidateVault();
      } catch (e) {
        alert(`Umbenennen fehlgeschlagen: ${e}`);
      }
    } else if (file.type === 'act') {
      // Akte sind Verzeichnisse — das Verzeichnis umbenennen, index.md bleibt
      const newSlug = renameValue.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-äöüß]/g, '');
      const oldActDir = file.path.substring(0, file.path.lastIndexOf('/index.md'));
      const actsDir = oldActDir.substring(0, oldActDir.lastIndexOf('/'));
      const newActDir = `${actsDir}/${newSlug}`;
      if (newActDir === oldActDir) return;

      try {
        await invoke('rename_file', { oldPath: oldActDir, newPath: newActDir });
        activeFile.set({ ...file, name: newSlug, path: `${newActDir}/index.md` });
        invalidateVault();
      } catch (e) {
        console.error('Umbenennen fehlgeschlagen:', e);
      }
    } else {
      const newName = renameValue.trim() + '.md';
      if (newName === file.name) return;

      const dir = file.path.substring(0, file.path.lastIndexOf('/'));
      const newPath = `${dir}/${newName}`;

      try {
        await invoke('rename_file', { oldPath: file.path, newPath });
        activeFile.set({ ...file, name: newName, path: newPath });
        invalidateVault();
      } catch (e) {
        console.error('Umbenennen fehlgeschlagen:', e);
      }
    }
  }

  function handleRenameKey(e: KeyboardEvent) {
    if (e.key === 'Enter') commitRename();
    if (e.key === 'Escape') renaming = false;
  }

  const MIN_W = 140;
  const MAX_SIDEBAR = 520;
  const MAX_LLM = 1400;

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

    function onError(e: ErrorEvent) {
      pushError(e.message || String(e));
    }
    function onUnhandled(e: PromiseRejectionEvent) {
      const msg = e.reason instanceof Error ? e.reason.message : String(e.reason);
      pushError(msg);
    }

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandled);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandled);
    };
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
    {:else if isMonster}
      <div class="toolbar">
        {#if $activeFile}
          <div class="file-title-area">
            <span class="file-title monster-title">⚔ {$activeFile.name}</span>
          </div>
        {/if}
      </div>
      <MonsterCard />
    {:else if isEncounter}
      <div class="toolbar">
        {#if $activeFile}
          <div class="file-title-area">
            <span class="file-title encounter-title">⚡ {$activeFile.name}</span>
          </div>
        {/if}
      </div>
      <EncounterCard />
    {:else if isSpell}
      <div class="toolbar">
        {#if $activeFile}
          <div class="file-title-area">
            <span class="file-title spell-title">✦ {$activeFile.name}</span>
          </div>
        {/if}
      </div>
      <SpellCard />
    {:else}
      <div class="toolbar">
        {#if $activeFile}
          <div class="file-title-area">
            {#if renaming}
              <input
                class="rename-input"
                bind:value={renameValue}
                onkeydown={handleRenameKey}
                onblur={commitRename}
                autofocus
              />
            {:else}
              <span class="file-title">
                {$activeFile.type === 'campaign' ? ($activeCampaign?.path ?? '') : $activeFile.name.replace('.md', '')}
              </span>
              <button class="rename-btn" onclick={startRename} title="Datei umbenennen">✏</button>
            {/if}
          </div>
        {/if}

        <div class="toolbar-sep"></div>
        {#if isMarkdownPrintable}
          <button class="history-btn" onclick={openMarkdownPrint} title="Drucken / PDF">🖨</button>
        {/if}
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
        <MarkdownEditor />
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

<ErrorToast />

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

  .file-title-area {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    margin-left: 0.5rem;
    min-width: 0;
    max-width: 40%;
  }

  .file-title {
    font-size: 0.82rem;
    color: #cdd6f4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
  }

  .monster-title {
    color: #f38ba8;
  }

  .encounter-title {
    color: #89dceb;
  }

  .spell-title {
    color: #cba6f7;
  }

  .rename-btn {
    background: transparent;
    border: none;
    color: #45475a;
    cursor: pointer;
    font-size: 0.75rem;
    padding: 0.1rem 0.2rem;
    flex-shrink: 0;
    border-radius: 3px;
  }

  .rename-btn:hover { color: #89b4fa; background: #313244; }

  .rename-input {
    background: #1e1e2e;
    border: 1px solid #89b4fa;
    border-radius: 4px;
    color: #cdd6f4;
    font-size: 0.82rem;
    padding: 0.2rem 0.4rem;
    outline: none;
    min-width: 0;
    width: 220px;
    font-family: inherit;
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
