<script lang="ts">
  import Sidebar from '$lib/components/Sidebar.svelte';
  import MarkdownEditor from '$lib/components/MarkdownEditor.svelte';
  import CharacterSheet from '$lib/components/CharacterSheet.svelte';
  import CardHost from '$lib/components/CardHost.svelte';
  import CharacterBadgeBar from '$lib/components/CharacterBadgeBar.svelte';
  import FileTitle from '$lib/components/FileTitle.svelte';
  import LlmPanel from '$lib/components/LlmPanel.svelte';
  import StructureHint from '$lib/components/StructureHint.svelte';
  import DragonMark from '$lib/components/DragonMark.svelte';
  import ToastStack from '$lib/components/ToastStack.svelte';
  import UpdateDialog from '$lib/components/UpdateDialog.svelte';
  import RateLimitToast from '$lib/components/RateLimitToast.svelte';
  import UnsavedChangesDialog from '$lib/components/UnsavedChangesDialog.svelte';
  import SaveAsDialog from '$lib/components/SaveAsDialog.svelte';
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
  import ContextActionModal from '$lib/components/ContextActionModal.svelte';
  import { cardTypeOf } from '$lib/components/cardRegistry';
  import { actionsFor, type ContextAction } from '$lib/services/contextActions';
  import { runStartupTasks } from '$lib/services/startupTasks';
  import { fileContent, activeFile, activeCampaign, historyState, undoContent, redoContent } from '$lib/stores/campaign';
  import { dragPanelWidth } from '$lib/utils/panelResize';
  import { onMount } from 'svelte';
  import CampaignPrintDialog from '$lib/components/campaign/CampaignPrintDialog.svelte';
  import { buildPrintHtmlMarkdown } from '$lib/utils/printEncounter';
  import { printHtmlDocument } from '$lib/utils/printFrame';
  import { renderMarkdown } from '$lib/utils/markdown';
  import { extractActTitle } from '$lib/utils/actExtract';
  import '$lib/components/toolbar.css';

  let isPdfCharacter = $derived(
    $activeFile?.type === 'character' && !!$activeFile?.dirPath
  );

  const showCharBar = $derived(
    $activeFile?.type === 'campaign' || $activeFile?.type === 'session'
  );

  let cardType = $derived(cardTypeOf($activeFile?.type));

  let isMarkdownPrintable = $derived(
    $activeFile?.type === 'act' || $activeFile?.type === 'campaign' || $activeFile?.type === 'notes'
  );

  // Kontextsensitive KI-Aktionen für den gerade geöffneten Entity-Typ
  let contextActions = $derived(actionsFor($activeFile?.type));
  let activeContextAction = $state<ContextAction | null>(null);

  let showCampaignPrint = $state(false);

  function openPrint() {
    if ($activeFile?.type === 'campaign') { showCampaignPrint = true; return; }
    if (!$fileContent || !$activeFile) return;
    const campaign = $activeCampaign?.name ?? '';
    const docName = extractActTitle($fileContent, $activeFile.name.replace('.md', ''));
    const typeLabel: Partial<Record<string, string>> = { act: 'Akt', notes: 'Notiz' };
    const label = typeLabel[$activeFile.type] ?? $activeFile.type;
    const title = `${campaign} – ${label}: ${docName}`;
    printHtmlDocument(buildPrintHtmlMarkdown(title, renderMarkdown($fileContent)), title);
  }

  const MIN_W = 140;
  const MAX_SIDEBAR = 520;
  const MAX_LLM = 1400;

  let sidebarWidth = $state(parseInt(localStorage.getItem('sidebar-width') ?? '220'));
  let llmWidth = $state(parseInt(localStorage.getItem('llm-width') ?? '460'));

  // KI-Panel ein-/ausklappbar, standardmäßig zugeklappt.
  let llmCollapsed = $state(localStorage.getItem('llm-collapsed') !== '0');
  let llmDragging = $state(false);
  let effLlmWidth = $derived(llmCollapsed ? 0 : llmWidth);

  function toggleLlm() {
    llmCollapsed = !llmCollapsed;
    localStorage.setItem('llm-collapsed', llmCollapsed ? '1' : '0');
  }

  function startResize(side: 'sidebar' | 'llm', e: MouseEvent) {
    const sidebar = side === 'sidebar';
    if (!sidebar) llmDragging = true;
    dragPanelWidth(e, {
      start: sidebar ? sidebarWidth : llmWidth,
      min: MIN_W,
      max: sidebar ? MAX_SIDEBAR : MAX_LLM,
      invert: !sidebar, // LLM-Panel ist rechts — nach links ziehen vergrößert
      onWidth: (w) => { if (sidebar) sidebarWidth = w; else llmWidth = w; },
      ondone: () => {
        localStorage.setItem('sidebar-width', String(sidebarWidth));
        localStorage.setItem('llm-width', String(llmWidth));
        llmDragging = false;
      },
    });
  }

  onMount(runStartupTasks);
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
    <div class="dragon-watermark"><DragonMark size={240} title="" /></div>
    {#if isPdfCharacter}
      <CharacterSheet dirPath={$activeFile!.dirPath!} />
    {:else if cardType}
      <CardHost type={cardType} />
    {:else}
      <div class="toolbar">
        {#if $activeFile}
          <FileTitle
            label={$activeFile.type === 'campaign' ? ($activeCampaign?.path ?? '') : $activeFile.name.replace('.md', '')}
            renamable
          />
        {/if}

        <div class="toolbar-sep"></div>
        {#each contextActions as ca}
          <button class="context-action-btn" onclick={() => (activeContextAction = ca)} title={ca.label}>
            {ca.icon} {ca.label}
          </button>
        {/each}
        {#if isMarkdownPrintable}
          <button class="history-btn" onclick={openPrint} title="Drucken / PDF">🖨</button>
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

      {#if showCharBar}
        <CharacterBadgeBar />
      {/if}

      <StructureHint />

      <div class="content">
        <MarkdownEditor />
      </div>
    {/if}
  </div>

  <div
    class="resize-handle"
    class:hidden={llmCollapsed}
    role="separator"
    aria-label="LLM-Panel-Breite ändern"
    onmousedown={(e) => startResize('llm', e)}
  ></div>

  <div
    class="panel-wrap llm-wrap"
    class:no-transition={llmDragging}
    style="width: {effLlmWidth}px"
  >
    <LlmPanel />
  </div>

  <button
    class="llm-toggle"
    class:no-transition={llmDragging}
    style="right: {effLlmWidth}px"
    onclick={toggleLlm}
    title={llmCollapsed ? 'KI-Panel öffnen' : 'KI-Panel schließen'}
    aria-label={llmCollapsed ? 'KI-Panel öffnen' : 'KI-Panel schließen'}
  >{llmCollapsed ? '✦' : '›'}</button>
</div>

<ToastStack />
<UpdateDialog />
<RateLimitToast />
<UnsavedChangesDialog />
<SaveAsDialog />
<ConfirmDialog />
{#if activeContextAction}
  <ContextActionModal action={activeContextAction} onclose={() => (activeContextAction = null)} />
{/if}
{#if showCampaignPrint && $activeCampaign}
  <CampaignPrintDialog
    campaignPath={$activeCampaign.path}
    campaignName={$activeCampaign.name}
    onclose={() => (showCampaignPrint = false)}
  />
{/if}

<style>
  :global(*, *::before, *::after) {
    box-sizing: border-box;
  }

  :global(body) {
    margin: 0;
    padding: 0;
    background: var(--bg);
    font-family: Inter, system-ui, sans-serif;
  }

  .app {
    display: flex;
    height: 100vh;
    overflow: hidden;
    position: relative;
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
    background: var(--surface);
    cursor: col-resize;
    transition: background 0.15s;
    position: relative;
    z-index: 10;
  }

  .resize-handle:hover,
  .resize-handle:active {
    background: var(--red);
  }

  .resize-handle.hidden {
    display: none;
  }

  /* KI-Panel: weiche Breiten-Transition beim Auf-/Zuklappen */
  .llm-wrap {
    transition: width 0.2s ease;
  }
  .llm-wrap.no-transition {
    transition: none;
  }

  /* Lasche am linken Rand des KI-Panels zum Auf-/Zuklappen */
  .llm-toggle {
    position: absolute;
    top: 50%;
    z-index: 20;
    width: 24px;
    height: 80px;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-panel);
    color: var(--ink-muted);
    border: 1px solid var(--surface);
    border-right: none;
    border-radius: 8px 0 0 8px;
    cursor: pointer;
    font-size: 1.05rem;
    line-height: 1;
    box-shadow: -2px 0 6px rgba(0, 0, 0, 0.15);
    transition: right 0.2s ease, color 0.1s, background 0.1s;
  }
  .llm-toggle.no-transition {
    transition: color 0.1s, background 0.1s;
  }
  .llm-toggle:hover {
    color: var(--red);
    background: var(--surface);
  }

  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    position: relative;
  }

  /* Dezentes Drachen-Wasserzeichen unten rechts im Arbeitsbereich */
  .dragon-watermark {
    position: absolute;
    right: 2.5rem;
    bottom: 1.5rem;
    color: var(--ink);
    opacity: 0.05;
    pointer-events: none;
    z-index: 0;
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

  .context-action-btn {
    font-size: 0.8rem;
    padding: 0.25rem 0.7rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink-soft);
    cursor: pointer;
    font-family: inherit;
    white-space: nowrap;
  }
  .context-action-btn:hover {
    border-color: var(--red);
    color: var(--red);
  }

  .content {
    flex: 1;
    display: flex;
    min-height: 0;
    overflow: hidden;
  }
</style>
