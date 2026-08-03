<script lang="ts">
  /** Log der API-Aufrufe: eine aufklappbare Zeile je Request, Response oder Fehler. */
  import { debugLog, clearDebugLog } from '../../stores/debug';
  import DebugEntryView from '../DebugEntryView.svelte';

  let expandedDebugId = $state<number | null>(null);
</script>

<div class="debug-output">
  <div class="debug-toolbar">
    <span class="debug-count">{$debugLog.length} Einträge</span>
    <button class="plain-btn" onclick={clearDebugLog} title="Log leeren">✕ Leeren</button>
  </div>
  {#if $debugLog.length === 0}
    <div class="debug-empty">Noch keine API-Calls — Chat oder Generieren nutzen.</div>
  {:else}
    {#each [...$debugLog].reverse() as entry (entry.id)}
      <div
        class="debug-entry"
        class:req={entry.type === 'request'}
        class:res={entry.type === 'response'}
        class:err={entry.type === 'error'}
      >
        <button
          class="debug-entry-header"
          onclick={() => (expandedDebugId = expandedDebugId === entry.id ? null : entry.id)}
        >
          <span class="debug-type {entry.type}">{entry.type}</span>
          <span class="debug-provider-label">{entry.provider}</span>
          <span class="debug-label-text">{entry.label}</span>
          <span class="debug-meta">
            {#if entry.durationMs !== undefined}{entry.durationMs}ms · {/if}{entry.timestamp.toLocaleTimeString()}
          </span>
          <span class="debug-chevron">{expandedDebugId === entry.id ? '▲' : '▼'}</span>
        </button>
        {#if expandedDebugId === entry.id}
          <DebugEntryView {entry} />
        {/if}
      </div>
    {/each}
  {/if}
</div>

<style>
  .debug-output {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .debug-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.4rem 0.75rem;
    border-bottom: 1px solid var(--surface);
    background: var(--bg-deep);
    flex-shrink: 0;
  }

  .debug-count {
    font-size: 0.7rem;
    color: var(--ink-muted);
    font-weight: 600;
  }

  .debug-empty {
    padding: 2rem 1rem;
    text-align: center;
    font-size: 0.78rem;
    color: var(--border);
    line-height: 1.5;
  }

  .debug-entry {
    border-bottom: 1px solid var(--bg-raised);
  }

  .debug-entry-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.75rem;
    width: 100%;
    background: transparent;
    border: none;
    border-radius: 0;
    color: var(--ink);
    cursor: pointer;
    text-align: left;
    font-size: 0.72rem;
    font-weight: 600;
    font-family: inherit;
  }

  .debug-entry-header:hover { background: var(--bg); }

  .debug-type {
    font-size: 0.62rem;
    font-weight: 700;
    border-radius: 3px;
    padding: 0.1rem 0.35rem;
    flex-shrink: 0;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .debug-type.request  { background: var(--bg-raised); color: var(--green); }
  .debug-type.response { background: var(--bg-raised); color: var(--red); }
  .debug-type.error    { background: var(--bg-deep); color: var(--danger); }

  .debug-provider-label {
    font-size: 0.68rem;
    color: var(--red);
    font-weight: 600;
    flex-shrink: 0;
  }

  .debug-label-text {
    flex: 1;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .debug-meta {
    font-size: 0.65rem;
    color: var(--border);
    flex-shrink: 0;
    white-space: nowrap;
  }

  .debug-chevron {
    font-size: 0.6rem;
    color: var(--border);
    flex-shrink: 0;
  }
</style>
