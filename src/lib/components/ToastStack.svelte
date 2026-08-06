<script lang="ts">
  import { toasts, dismissToast, type Toast } from '../stores/toasts';

  function run(toast: Toast) {
    toast.action?.run();
    dismissToast(toast.id);
  }
</script>

{#if $toasts.length > 0}
  <div class="toast-container">
    {#each $toasts as toast (toast.id)}
      <div class="toast" class:notice={toast.kind === 'notice'}>
        <span class="toast-msg">{toast.message}</span>
        {#if toast.action}
          <button class="toast-action" onclick={() => run(toast)}>{toast.action.label}</button>
        {/if}
        <button class="toast-close" onclick={() => dismissToast(toast.id)}>✕</button>
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
    gap: 0.75rem;
    background: var(--surface);
    border: 1px solid var(--danger);
    border-radius: 6px;
    padding: 0.65rem 0.75rem;
    color: var(--ink);
    font-size: 0.82rem;
    line-height: 1.5;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    animation: slide-in 0.15s ease-out;
  }

  .toast.notice { border-color: var(--gold); }

  .toast-msg {
    flex: 1;
    word-break: break-word;
  }

  .toast-action {
    background: none;
    border: 1px solid var(--gold);
    border-radius: 4px;
    color: var(--gold);
    cursor: pointer;
    font-family: inherit;
    font-size: 0.75rem;
    padding: 0.2rem 0.5rem;
    flex-shrink: 0;
    white-space: nowrap;
  }
  .toast-action:hover { filter: brightness(1.2); }

  .toast-close {
    background: none;
    border: none;
    color: var(--ink-muted);
    cursor: pointer;
    font-size: 0.75rem;
    padding: 0;
    flex-shrink: 0;
    line-height: 1;
  }
  .toast-close:hover { color: var(--danger); }

  @keyframes slide-in {
    from { opacity: 0; transform: translateX(1rem); }
    to   { opacity: 1; transform: translateX(0); }
  }
</style>
