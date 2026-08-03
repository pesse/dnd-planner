<script lang="ts">
  import { updateState, updateDialogOpen, installUpdate, dismissUpdate } from '$lib/stores/update';
  import { marked } from 'marked';
  import PromptDialog from './ui/PromptDialog.svelte';

  const busy = $derived($updateState.status === 'downloading' || $updateState.status === 'installing');
  const pct = $derived(Math.round(($updateState.progress ?? 0) * 100));
  // Release-Notes aus latest.json als Markdown rendern (Quelle: eigenes, über HTTPS bezogenes Release).
  const notesHtml = $derived(
    $updateState.notes ? (marked.parse($updateState.notes, { async: false }) as string) : ''
  );

  function onKey(e: KeyboardEvent) {
    if (!$updateDialogOpen) return;
    if (e.key === 'Escape' && !busy) dismissUpdate();
  }
</script>

<svelte:window onkeydown={onKey} />

{#if $updateDialogOpen}
  <PromptDialog
    title={`Update verfügbar${$updateState.version ? ` — v${$updateState.version}` : ''}`}
    accent="var(--gold)"
    maxWidth="460px"
    titleGap="0.75rem"
    onbackdrop={() => { if (!busy) dismissUpdate(); }}
  >
    {#if notesHtml}
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      <div class="notes">{@html notesHtml}</div>
    {:else}
      <p class="blurb">Eine neuere Version steht bereit.</p>
    {/if}

    {#if busy}
      <div class="progress">
        <div class="bar" style="width: {pct}%"></div>
      </div>
      <p class="blurb status">
        {$updateState.status === 'installing' ? 'Installieren & Neustart…' : `Wird heruntergeladen… ${pct}%`}
      </p>
    {/if}

    {#snippet actions()}
      <button class="cancel-btn" disabled={busy} onclick={() => dismissUpdate()}>Später</button>
      <button class="ok-btn" disabled={busy} onclick={() => installUpdate()}>Jetzt aktualisieren</button>
    {/snippet}
  </PromptDialog>
{/if}

<style>
  .blurb {
    margin: 0 0 1.25rem;
    font-size: 0.85rem;
    color: var(--ink-muted);
    line-height: 1.5;
  }

  .notes {
    margin: 0 0 1.25rem;
    font-size: 0.8rem;
    color: var(--ink-muted);
    line-height: 1.5;
    word-break: break-word;
    max-height: 260px;
    overflow-y: auto;
  }
  /* gerenderte Markdown-Inhalte der Release-Notes */
  .notes :global(h1),
  .notes :global(h2),
  .notes :global(h3) {
    color: var(--gold);
    font-size: 0.9rem;
    margin: 0.75rem 0 0.35rem;
  }
  .notes :global(h1:first-child),
  .notes :global(h2:first-child),
  .notes :global(h3:first-child) {
    margin-top: 0;
  }
  .notes :global(p) {
    margin: 0 0 0.5rem;
  }
  .notes :global(ul),
  .notes :global(ol) {
    margin: 0 0 0.5rem;
    padding-left: 1.2rem;
  }
  .notes :global(li) {
    margin: 0.1rem 0;
  }
  .notes :global(a) {
    color: var(--arcane);
  }
  .notes :global(code) {
    background: var(--border);
    border-radius: 3px;
    padding: 0.05rem 0.3rem;
    font-size: 0.75rem;
  }

  .progress {
    height: 6px;
    background: var(--border);
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 0.5rem;
  }
  .bar {
    height: 100%;
    background: var(--green);
    transition: width 0.15s ease-out;
  }

  .cancel-btn:disabled,
  .ok-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .ok-btn:not(:disabled):hover { filter: brightness(1.1); }

  .cancel-btn:not(:disabled):hover { color: var(--ink); }
</style>
