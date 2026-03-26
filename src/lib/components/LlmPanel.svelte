<script lang="ts">
  import { llmLoading, llmMessages, llmConfig } from '../stores/llm';

  let input = $state('');

  async function sendMessage() {
    if (!input.trim()) return;

    const userMsg = input.trim();
    input = '';

    llmMessages.update((msgs) => [...msgs, { role: 'user', content: userMsg }]);
    llmLoading.set(true);

    try {
      const config = $llmConfig;

      if (config.provider === 'ollama') {
        const res = await fetch(`${config.baseUrl}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: config.model, prompt: userMsg, stream: false }),
        });
        const data = await res.json();
        llmMessages.update((msgs) => [...msgs, { role: 'assistant', content: data.response }]);
      }
    } catch (e) {
      llmMessages.update((msgs) => [
        ...msgs,
        { role: 'assistant', content: '⚠️ Fehler: Ollama nicht erreichbar.' },
      ]);
    } finally {
      llmLoading.set(false);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }
</script>

<div class="llm-panel">
  <div class="messages">
    {#each $llmMessages as msg}
      <div class="message {msg.role}">
        <span class="role">{msg.role === 'user' ? 'Du' : 'KI'}</span>
        <p>{msg.content}</p>
      </div>
    {/each}

    {#if $llmLoading}
      <div class="message assistant loading">
        <span class="role">KI</span>
        <p>...</p>
      </div>
    {/if}
  </div>

  <div class="input-row">
    <textarea
      bind:value={input}
      onkeydown={handleKeydown}
      placeholder="Frage an die KI (Enter = senden)"
      rows="3"
    ></textarea>
    <button onclick={sendMessage} disabled={$llmLoading}>Senden</button>
  </div>
</div>

<style>
  .llm-panel {
    width: 300px;
    display: flex;
    flex-direction: column;
    background: #181825;
    border-left: 1px solid #313244;
    flex-shrink: 0;
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .message {
    background: #1e1e2e;
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
  }

  .message.user {
    background: #313244;
  }

  .role {
    font-size: 0.75rem;
    color: #6c7086;
    font-weight: 600;
    display: block;
    margin-bottom: 0.25rem;
  }

  .message p {
    margin: 0;
    font-size: 0.9rem;
    color: #cdd6f4;
    white-space: pre-wrap;
  }

  .loading p {
    color: #6c7086;
  }

  .input-row {
    padding: 0.75rem;
    border-top: 1px solid #313244;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  textarea {
    background: #1e1e2e;
    border: 1px solid #313244;
    border-radius: 6px;
    color: #cdd6f4;
    padding: 0.5rem;
    font-size: 0.9rem;
    resize: none;
    outline: none;
    font-family: inherit;
  }

  button {
    background: #cba6f7;
    color: #1e1e2e;
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
</style>
