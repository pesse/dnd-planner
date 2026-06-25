<script lang="ts">
  import { rateLimitWaits } from '../stores/rateLimit';
</script>

{#if $rateLimitWaits.length > 0}
  <div class="toast-container">
    {#each $rateLimitWaits as wait (wait.id)}
      <div class="toast">
        <span class="toast-icon" aria-hidden="true">⏳</span>
        <span class="toast-msg">{wait.message}</span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-width: 420px;
  }

  .toast {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    background: var(--surface);
    border: 1px solid var(--gold);
    border-radius: 6px;
    padding: 0.65rem 0.75rem;
    color: var(--ink);
    font-size: 0.82rem;
    line-height: 1.5;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    animation: slide-in 0.15s ease-out;
  }

  .toast-icon { flex-shrink: 0; }

  .toast-msg {
    flex: 1;
    word-break: break-word;
  }

  @keyframes slide-in {
    from { opacity: 0; transform: translateX(1rem); }
    to   { opacity: 1; transform: translateX(0); }
  }
</style>
