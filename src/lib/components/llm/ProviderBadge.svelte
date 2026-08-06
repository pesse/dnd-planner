<script lang="ts">
  import type { LlmProvider } from '../../types';
  import type { TokenUsage } from '../../stores/llm';

  let {
    provider,
    model,
    tokenStats,
    onreset,
  }: {
    provider: LlmProvider;
    model: string;
    tokenStats: { last: TokenUsage; session: TokenUsage };
    onreset: () => void;
  } = $props();

  function fmtTokens(n: number): string {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  }
</script>

<div class="provider-badge">
  <span class="badge" class:ollama={provider === 'ollama'} class:anthropic={provider === 'anthropic'} class:groq={provider === 'groq'} class:qualityminds={provider === 'qualityminds'}>
    {provider === 'ollama' ? '🦙 Ollama' : provider === 'groq' ? '⚡ Groq' : provider === 'qualityminds' ? '🟣 QualityMinds' : '✦ Anthropic'}
  </span>
  <span class="model-name">{model}</span>
  <div class="token-stats">
    <span class="token-item" title="Zuletzt gesendet / empfangen">
      ↑{tokenStats.last.sent > 0 ? fmtTokens(tokenStats.last.sent) : '–'}
      ↓{tokenStats.last.received > 0 ? fmtTokens(tokenStats.last.received) : '–'}
    </span>
    {#if tokenStats.session.sent > 0}
      <span class="token-sep">|</span>
      <span class="token-item token-session" title="Session gesamt">
        Σ ↑{fmtTokens(tokenStats.session.sent)} ↓{fmtTokens(tokenStats.session.received)}
      </span>
      <button class="token-reset" onclick={onreset} title="Session-Zähler zurücksetzen">↺</button>
    {/if}
  </div>
</div>

<style>
  .provider-badge {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.75rem;
    background: var(--bg-deep);
    border-bottom: 1px solid var(--surface);
    flex-shrink: 0;
  }

  .badge {
    font-size: 0.7rem;
    font-weight: 700;
    border-radius: 3px;
    padding: 0.1rem 0.4rem;
  }

  .badge.ollama    { background: var(--bg-raised); color: var(--green); }
  .badge.anthropic { background: var(--bg-raised); color: var(--arcane); }
  .badge.groq      { background: var(--bg-deep); color: var(--copper); }
  .badge.qualityminds { background: var(--bg-raised); color: var(--arcane); }

  .model-name {
    font-size: 0.68rem;
    color: var(--border);
  }

  .token-stats {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .token-item {
    font-size: 0.65rem;
    color: var(--border);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .token-session { color: var(--ink-muted); }
  .token-sep { font-size: 0.6rem; color: var(--surface); }

  .token-reset {
    background: transparent;
    border: none;
    color: var(--border);
    cursor: pointer;
    font-size: 0.7rem;
    padding: 0;
    line-height: 1;
    border-radius: 0;
  }

  .token-reset:hover { color: var(--ink-muted); }
</style>
