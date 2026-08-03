<script lang="ts">
  /** Antworttext als Code-Blöcke mit Aktionsleiste, Markdown oder Klartext. */
  import { activeFile, activeCampaign, appendContent } from '../../stores/campaign';
  import {
    hasCodeBlock,
    looksLikeMarkdown,
    parseSegments,
    replaceWithResponse,
    suggestNewFilePath,
    writeNewFile,
  } from '../../services/responseArtifacts';
  import MarkdownBody from './MarkdownBody.svelte';
  import NewFileRow from './NewFileRow.svelte';

  let { text }: { text: string } = $props();

  let copied = $state<Record<number, boolean>>({});
  let fileOpen = $state<Record<number, boolean>>({});
  let filePath = $state<Record<number, string>>({});
  let fileStatus = $state<Record<number, 'idle' | 'saving' | 'saved' | 'error'>>({});

  async function copyBlock(i: number, content: string) {
    await navigator.clipboard.writeText(content);
    copied[i] = true;
    setTimeout(() => { copied[i] = false; }, 1500);
  }

  function toggleFile(i: number) {
    if (fileOpen[i]) {
      fileOpen[i] = false;
    } else {
      fileOpen[i] = true;
      if (!filePath[i]) filePath[i] = suggestNewFilePath($activeFile, $activeCampaign);
      fileStatus[i] = 'idle';
    }
  }

  async function saveBlock(i: number, content: string) {
    if (!filePath[i]?.trim()) return;
    fileStatus[i] = 'saving';
    try {
      await writeNewFile(filePath[i].trim(), content);
      fileStatus[i] = 'saved';
    } catch {
      fileStatus[i] = 'error';
    }
  }
</script>

{#if hasCodeBlock(text)}
  {#each parseSegments(text) as seg, si}
    {#if seg.type === 'code'}
      <div class="code-block-wrap">
        <div class="block-action-bar">
          {#if seg.lang}<span class="block-lang">{seg.lang}</span>{/if}
          <button class="block-btn" onclick={() => copyBlock(si, seg.content)} title="Kopieren">{copied[si] ? '✓' : '⎘'}</button>
          {#if $activeFile}
            <button class="block-btn" onclick={() => appendContent(seg.content)}>+ Anhängen</button>
            <button class="block-btn" onclick={() => replaceWithResponse(seg.content, $activeFile)}>↺ Ersetzen</button>
          {/if}
          <button class="block-btn" onclick={() => toggleFile(si)}>+ Datei</button>
        </div>
        <pre class="code-block"><code>{seg.content}</code></pre>
        {#if fileOpen[si]}
          <NewFileRow
            bind:path={filePath[si]}
            status={fileStatus[si]}
            placeholder="./vault/campaigns/.../datei.md"
            inset
            onsave={() => saveBlock(si, seg.content)}
          />
        {/if}
      </div>
    {:else if seg.content.trim()}
      {#if looksLikeMarkdown(seg.content)}
        <MarkdownBody text={seg.content} />
      {:else}
        <p>{seg.content}</p>
      {/if}
    {/if}
  {/each}
{:else if looksLikeMarkdown(text)}
  <MarkdownBody {text} />
{:else}
  <p>{text}</p>
{/if}

<style>
  p {
    margin: 0;
    font-size: 0.9rem;
    color: var(--ink);
    white-space: pre-wrap;
  }

  .code-block-wrap {
    margin: 0.5rem 0;
    border: 1px solid var(--surface);
    border-radius: 6px;
    overflow: hidden;
  }

  .block-action-bar {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.2rem 0.5rem;
    background: var(--bg);
    border-bottom: 1px solid var(--surface);
    flex-wrap: wrap;
  }

  .block-lang {
    font-size: 0.7rem;
    color: var(--ink-muted);
    font-family: monospace;
    flex: 1;
  }

  .block-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--ink-soft);
    cursor: pointer;
    font-size: 0.72rem;
    font-weight: 600;
    padding: 0.1rem 0.4rem;
    white-space: nowrap;
  }

  .block-btn:hover {
    background: var(--surface);
    color: var(--ink);
  }

  .code-block {
    margin: 0;
    padding: 0.6rem 0.75rem;
    background: var(--bg-deep);
    color: var(--ink);
    font-size: 0.8rem;
    overflow-x: auto;
    white-space: pre;
  }
</style>
