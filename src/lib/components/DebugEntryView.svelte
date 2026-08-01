<script lang="ts">
  import type { DebugEntry } from '../stores/debug';
  import { describeEntry } from '../utils/debugFormat';
  import { prettyJson } from '../utils/debugJson';

  let { entry }: { entry: DebugEntry } = $props();

  let raw = $state(false);
  const view = $derived(describeEntry(entry));

  /** Objekt/Array → eingerücktes JSON, String → unverändert. */
  function fmt(v: unknown): string {
    return typeof v === 'string' ? v : prettyJson(v);
  }

  const ROLE_LABEL: Record<string, string> = {
    system: 'System',
    user: 'User',
    assistant: 'Assistant',
    tool: 'Tool',
  };
</script>

<div class="dv">
  <div class="dv-toolbar">
    <button class="dv-toggle" class:active={raw} onclick={() => (raw = !raw)}>
      {raw ? '◧ Strukturiert' : '{ } Roh-JSON'}
    </button>
  </div>

  {#if raw || view.kind === 'raw'}
    <pre class="dv-pre">{prettyJson(entry.data)}</pre>

  {:else if view.kind === 'error'}
    <pre class="dv-pre wrap dv-error">{view.text}</pre>

  {:else if view.kind === 'note'}
    <div class="dv-note">{view.text}</div>

  {:else if view.kind === 'request'}
    {#if view.model || view.url}
      <div class="dv-head">
        {#if view.model}<span class="dv-model">{view.model}</span>{/if}
        {#if view.url}<span class="dv-url">{view.url}</span>{/if}
      </div>
    {/if}

    {#each view.messages as msg}
      <div class="dv-msg">
        <span class="dv-role role-{msg.role}">{ROLE_LABEL[msg.role] ?? msg.role}</span>
        <div class="dv-msg-body">
          {#if msg.content !== undefined && msg.content !== null && msg.content !== ''}
            <pre class="dv-pre wrap">{fmt(msg.content)}</pre>
          {/if}
          {#if msg.toolCalls}
            {#each msg.toolCalls as tc}
              <div class="dv-tool">
                <span class="dv-tool-name">▸ {tc.name}</span>
                <pre class="dv-pre">{fmt(tc.args)}</pre>
              </div>
            {/each}
          {/if}
        </div>
      </div>
    {/each}

    {#if view.tools.length}
      <details class="dv-details">
        <summary>Tools ({view.tools.length})</summary>
        <div class="dv-tool-list">
          {#each view.tools as t}<code>{t}</code>{/each}
        </div>
      </details>
    {/if}

    {#if Object.keys(view.params).length}
      <details class="dv-details">
        <summary>Parameter</summary>
        <pre class="dv-pre">{prettyJson(view.params)}</pre>
      </details>
    {/if}

    {#if view.headers}
      <details class="dv-details">
        <summary>Headers</summary>
        <pre class="dv-pre">{prettyJson(view.headers)}</pre>
      </details>
    {/if}

  {:else if view.kind === 'response'}
    {#if view.content}
      <div class="dv-section-label">Antwort</div>
      <pre class="dv-pre wrap">{fmt(view.content)}</pre>
    {/if}
    {#each view.toolCalls as tc}
      <div class="dv-tool">
        <span class="dv-tool-name">▸ {tc.name}</span>
        <pre class="dv-pre">{fmt(tc.args)}</pre>
      </div>
    {/each}
    <div class="dv-foot">
      {#if view.finishReason}<span>finish: {view.finishReason}</span>{/if}
      {#if view.usage}<span>{fmt(view.usage)}</span>{/if}
    </div>

  {:else if view.kind === 'anthropic'}
    {#each view.blocks as block}
      {#if block.type === 'tool_use'}
        <div class="dv-tool">
          <span class="dv-tool-name">▸ {block.name}</span>
          <pre class="dv-pre">{fmt(block.value)}</pre>
        </div>
      {:else}
        <pre class="dv-pre wrap">{fmt(block.value)}</pre>
      {/if}
    {/each}
    <div class="dv-foot">
      {#if view.stopReason}<span>stop: {view.stopReason}</span>{/if}
      {#if view.usage}<span>{fmt(view.usage)}</span>{/if}
    </div>
  {/if}
</div>

<style>
  .dv {
    padding: 0.4rem 0.75rem 0.6rem;
    background: var(--bg-deep);
    border-top: 1px solid var(--bg-raised);
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    max-height: 460px;
    overflow-y: auto;
  }

  .dv-toolbar {
    display: flex;
    justify-content: flex-end;
  }

  .dv-toggle {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--ink-muted);
    border-radius: 4px;
    padding: 0.1rem 0.4rem;
    font-size: 0.65rem;
    cursor: pointer;
    font-family: inherit;
  }
  .dv-toggle:hover { border-color: var(--red); color: var(--red); }
  .dv-toggle.active { border-color: var(--red); color: var(--red); }

  .dv-pre {
    margin: 0;
    padding: 0.35rem 0.5rem;
    font-size: 0.68rem;
    line-height: 1.45;
    color: var(--ink-soft);
    background: var(--bg);
    border-radius: 4px;
    white-space: pre;
    overflow-x: auto;
  }
  /* Fließtext (Prompts, Antworten, Fehler): umbrechen statt horizontal scrollen,
     aber nur bei Bedarf brechen — nicht mitten im Wort (kein break-all). */
  .dv-pre.wrap {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .dv-error { color: var(--danger); }

  .dv-note {
    font-size: 0.7rem;
    color: var(--gold);
    font-style: italic;
    padding: 0.2rem 0;
  }

  .dv-head {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: baseline;
  }
  .dv-model { font-size: 0.72rem; font-weight: 700; color: var(--red); }
  .dv-url { font-size: 0.62rem; color: var(--border); word-break: break-all; }

  .dv-msg {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .dv-msg-body {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .dv-role {
    align-self: flex-start;
    font-size: 0.6rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0.05rem 0.35rem;
    border-radius: 3px;
    background: var(--bg-raised);
    color: var(--ink-muted);
  }
  .dv-role.role-system    { color: var(--gold); }
  .dv-role.role-user      { color: var(--green); }
  .dv-role.role-assistant { color: var(--red); }
  .dv-role.role-tool      { color: var(--ink-muted); }

  .dv-tool {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    border-left: 2px solid color-mix(in srgb, var(--red) 40%, transparent);
    padding-left: 0.4rem;
  }
  .dv-tool-name {
    font-size: 0.68rem;
    font-weight: 600;
    color: var(--red);
    font-family: monospace;
  }

  .dv-section-label {
    font-size: 0.62rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--ink-muted);
  }

  .dv-details > summary {
    font-size: 0.68rem;
    color: var(--ink-muted);
    cursor: pointer;
    padding: 0.15rem 0;
  }
  .dv-details > summary:hover { color: var(--red); }

  .dv-tool-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    padding: 0.2rem 0;
  }
  .dv-tool-list code {
    font-size: 0.66rem;
    background: var(--bg);
    color: var(--ink-soft);
    padding: 0.05rem 0.3rem;
    border-radius: 3px;
  }

  .dv-foot {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    font-size: 0.62rem;
    color: var(--border);
  }
  .dv-foot span { white-space: pre-wrap; }
</style>
