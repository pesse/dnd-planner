<script lang="ts">
  import type { LlmMode } from './panelMode';
  import { llmLoading, llmMessages } from '../../stores/llm';

  let {
    mode,
    input = $bindable(''),
    agentRunning,
    onsend,
    onagentrun,
    onagentstop,
  }: {
    mode: LlmMode;
    input: string;
    agentRunning: boolean;
    onsend: () => void;
    onagentrun: () => void;
    onagentstop: () => void;
  } = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onsend();
    }
  }
</script>

{#if mode !== 'debug'}
  <div class="input-row">
    <textarea
      bind:value={input}
      onkeydown={mode !== 'agent' ? handleKeydown : undefined}
      placeholder={mode === 'chat'
        ? 'Frage an die KI (Enter = senden)'
        : mode === 'agent'
        ? 'Aufgabe beschreiben (der Agent erledigt sie selbstständig)'
        : 'Was soll generiert werden?'}
      rows="3"
      disabled={agentRunning}
    ></textarea>
    <div class="input-buttons">
      {#if mode === 'chat'}
        <button class="clear-btn" onclick={() => llmMessages.set([])} disabled={$llmLoading}>Leeren</button>
      {/if}
      {#if mode === 'agent'}
        <button onclick={onagentrun} disabled={agentRunning || !input.trim()} class="agent-run-btn">
          {agentRunning ? 'Läuft…' : 'Starten'}
        </button>
        {#if agentRunning}
          <button onclick={onagentstop} class="agent-stop-btn">Stop</button>
        {/if}
      {:else}
        <button onclick={onsend} disabled={$llmLoading}>
          {mode === 'chat' ? 'Senden' : 'Generieren'}
        </button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .input-row {
    padding: 0.75rem;
    border-top: 1px solid var(--surface);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  textarea {
    background: var(--bg);
    border: 1px solid var(--surface);
    border-radius: 6px;
    color: var(--ink);
    padding: 0.5rem;
    font-size: 0.9rem;
    resize: none;
    outline: none;
    font-family: inherit;
  }

  .input-buttons {
    display: flex;
    gap: 0.5rem;
  }

  button {
    background: var(--arcane);
    color: var(--bg);
    border: none;
    border-radius: 6px;
    padding: 0.4rem 1rem;
    cursor: pointer;
    font-weight: 600;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .clear-btn {
    background: var(--surface);
    color: var(--ink);
    flex: 0 0 auto;
  }

  .input-buttons button:last-child { flex: 1; }

  .agent-run-btn {
    flex: 1;
    background: var(--green);
    color: var(--bg);
  }

  .agent-run-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .agent-stop-btn {
    background: transparent;
    border: 1px solid var(--danger);
    color: var(--danger);
    border-radius: 4px;
    padding: 0.35rem 0.75rem;
    cursor: pointer;
    font-size: 0.85rem;
    flex-shrink: 0;
  }
  .agent-stop-btn:hover { background: color-mix(in srgb, var(--danger) 15%, transparent); }
</style>
