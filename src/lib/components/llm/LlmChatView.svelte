<script lang="ts">
  /** Chat-Verlauf mit History: Nachrichtenliste, Live-Stream und Übernahme-Aktionen. */
  import { llmLoading, llmMessages } from '../../stores/llm';
  import { activeFile, activeCampaign, appendContent } from '../../stores/campaign';
  import { replaceWithResponse, suggestNewFilePath, writeNewFile } from '../../services/responseArtifacts';
  import ResponseBlocks from './ResponseBlocks.svelte';
  import NewFileRow from './NewFileRow.svelte';

  let { streamingIndex }: { streamingIndex: number | null } = $props();

  let messagesEl = $state<HTMLDivElement | null>(null);
  $effect(() => {
    void $llmMessages; // Abhängigkeit: bei jedem (auch gestreamten) Update nach unten scrollen
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
  });

  let copiedMsgIndex = $state<number | null>(null);
  let newFileMsgIndex = $state<number | null>(null);
  let newFileMsgPath = $state('');
  let newFileMsgStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function copyMessage(text: string, idx: number) {
    await navigator.clipboard.writeText(text);
    copiedMsgIndex = idx;
    setTimeout(() => { copiedMsgIndex = null; }, 1500);
  }

  function toggleNewFile(idx: number) {
    if (newFileMsgIndex === idx) {
      newFileMsgIndex = null;
    } else {
      newFileMsgIndex = idx;
      newFileMsgPath = suggestNewFilePath($activeFile, $activeCampaign);
      newFileMsgStatus = 'idle';
    }
  }

  async function saveAsNewFileMsg(content: string): Promise<void> {
    if (!newFileMsgPath.trim()) return;
    newFileMsgStatus = 'saving';
    try {
      await writeNewFile(newFileMsgPath.trim(), content);
      newFileMsgStatus = 'saved';
    } catch {
      newFileMsgStatus = 'error';
    }
  }
</script>

<div class="messages" bind:this={messagesEl}>
  {#each $llmMessages as msg, i}
    <div class="message {msg.role}">
      <span class="role">{msg.role === 'user' ? 'Du' : 'KI'}</span>
      {#if msg.role === 'assistant' && i === streamingIndex}
        <!-- Live-Stream: Klartext + Cursor; Markdown/Code-Parsing erst nach Abschluss -->
        <p class="streaming">{msg.content}<span class="stream-cursor"></span></p>
      {:else if msg.role === 'assistant'}
        <ResponseBlocks text={msg.content} />
      {:else}
        <p>{msg.content}</p>
      {/if}
      {#if msg.role === 'assistant' && i !== streamingIndex}
        <div class="msg-apply-row">
          <button class="msg-apply-btn copy" onclick={() => copyMessage(msg.content, i)} title="Kopieren">
            {copiedMsgIndex === i ? '✓' : '⎘'}
          </button>
          {#if $activeFile}
            <button class="msg-apply-btn append" onclick={() => appendContent(msg.content)}>+ Anhängen</button>
            <button class="msg-apply-btn replace" onclick={() => replaceWithResponse(msg.content, $activeFile)}>↺ Ersetzen</button>
          {/if}
          <button class="msg-apply-btn new-file" onclick={() => toggleNewFile(i)}>+ Datei</button>
        </div>
        {#if newFileMsgIndex === i}
          <NewFileRow bind:path={newFileMsgPath} status={newFileMsgStatus} onsave={() => saveAsNewFileMsg(msg.content)} />
        {/if}
      {/if}
    </div>
  {/each}

  {#if $llmLoading && streamingIndex === null}
    <div class="message assistant loading">
      <span class="role">KI</span>
      <p>...</p>
    </div>
  {/if}
</div>

<style>
  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-height: 0;
  }

  .message {
    background: var(--bg);
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
  }

  .message.user { background: var(--surface); }

  .role {
    font-size: 0.75rem;
    color: var(--ink-muted);
    font-weight: 600;
    display: block;
    margin-bottom: 0.25rem;
  }

  .message p {
    margin: 0;
    font-size: 0.9rem;
    color: var(--ink);
    white-space: pre-wrap;
  }

  /* Live-Stream-Cursor (blinkender Caret hinter dem zuletzt empfangenen Token) */
  .stream-cursor {
    display: inline-block;
    width: 0.5em;
    height: 1em;
    margin-left: 1px;
    vertical-align: text-bottom;
    background: var(--ink);
    opacity: 0.7;
    animation: stream-blink 1s steps(2, start) infinite;
  }
  @keyframes stream-blink { 50% { opacity: 0; } }

  .loading p { color: var(--ink-muted); }

  .msg-apply-row {
    display: flex;
    gap: 0.3rem;
    margin-top: 0.4rem;
    padding-top: 0.4rem;
    border-top: 1px solid var(--surface);
  }

  .msg-apply-btn {
    flex: 1;
    border: none;
    border-radius: 4px;
    padding: 0.2rem 0.4rem;
    font-size: 0.7rem;
    font-weight: 700;
    cursor: pointer;
  }

  .msg-apply-btn.copy     { background: var(--surface); color: var(--ink); border: 1px solid var(--border); flex: 0 0 auto; min-width: 2rem; }
  .msg-apply-btn.append  { background: var(--green); color: var(--bg); }
  .msg-apply-btn.replace { background: var(--gold); color: var(--bg); }
  .msg-apply-btn.new-file { background: var(--red); color: var(--bg); }
</style>
