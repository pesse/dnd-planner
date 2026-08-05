<script lang="ts">
  import type { LlmMode } from './panelMode';

  let {
    mode = $bindable<LlmMode>(),
    showSettings = $bindable(false),
    debugCount,
  }: {
    mode: LlmMode;
    showSettings: boolean;
    debugCount: number;
  } = $props();
</script>

<div class="mode-bar">
  <button class="mode-btn" class:active={mode === 'chat'} onclick={() => (mode = 'chat')}>
    Chat
  </button>
  <button class="mode-btn" class:active={mode === 'generate'} onclick={() => (mode = 'generate')}>
    Generieren
  </button>
  <button class="mode-btn agent-tab" class:active={mode === 'agent'} onclick={() => (mode = 'agent')}>
    Agent
  </button>
  <button class="mode-btn debug-tab" class:active={mode === 'debug'} onclick={() => (mode = 'debug')}>
    Debug {#if debugCount > 0}<span class="debug-badge">{debugCount}</span>{/if}
  </button>
  <span class="mode-hint">
    {mode === 'chat' ? 'mit History' : mode === 'generate' ? 'einmaliger Output' : mode === 'agent' ? 'Vault-Zugriff' : 'API-Log'}
  </span>
  <button
    class="settings-btn"
    class:active={showSettings}
    onclick={() => (showSettings = !showSettings)}
    title="LLM-Einstellungen"
  >⚙</button>
</div>

<style>
  .mode-bar {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.4rem 0.75rem;
    border-bottom: 1px solid var(--surface);
    background: var(--bg-deep);
    position: relative;
    flex-shrink: 0;
  }

  .mode-btn {
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.2rem 0.6rem;
    font-size: 0.78rem;
    cursor: pointer;
    font-weight: 600;
  }

  .mode-btn.active {
    background: var(--red);
    color: var(--bg);
    border-color: var(--red);
  }

  .mode-btn.agent-tab.active {
    background: var(--green);
    color: var(--bg);
    border-color: var(--green);
  }

  .mode-btn.debug-tab.active {
    background: var(--danger);
    color: var(--bg);
    border-color: var(--danger);
  }

  .debug-tab { position: relative; }

  .debug-badge {
    display: inline-block;
    background: var(--danger);
    color: var(--bg);
    border-radius: 8px;
    font-size: 0.6rem;
    font-weight: 700;
    padding: 0 0.3rem;
    margin-left: 0.2rem;
    vertical-align: middle;
    line-height: 1.4;
  }

  .mode-hint {
    font-size: 0.65rem;
    color: var(--border);
    margin-left: 0.25rem;
  }

  .settings-btn {
    margin-left: auto;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink-muted);
    cursor: pointer;
    font-size: 0.85rem;
    padding: 0.15rem 0.4rem;
  }

  .settings-btn.active {
    color: var(--gold);
    border-color: var(--gold);
  }
</style>
