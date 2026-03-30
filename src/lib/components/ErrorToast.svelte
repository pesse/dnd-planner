<script lang="ts">
  import { appErrors, dismissError } from '../stores/errors';
</script>

{#if $appErrors.length > 0}
  <div class="toast-container">
    {#each $appErrors as err (err.id)}
      <div class="toast">
        <span class="toast-msg">{err.message}</span>
        <button class="toast-close" onclick={() => dismissError(err.id)}>✕</button>
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
    background: #313244;
    border: 1px solid #f38ba8;
    border-radius: 6px;
    padding: 0.65rem 0.75rem;
    color: #cdd6f4;
    font-size: 0.82rem;
    line-height: 1.5;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    animation: slide-in 0.15s ease-out;
  }

  .toast-msg {
    flex: 1;
    word-break: break-word;
  }

  .toast-close {
    background: none;
    border: none;
    color: #6c7086;
    cursor: pointer;
    font-size: 0.75rem;
    padding: 0;
    flex-shrink: 0;
    line-height: 1;
  }
  .toast-close:hover { color: #f38ba8; }

  @keyframes slide-in {
    from { opacity: 0; transform: translateX(1rem); }
    to   { opacity: 1; transform: translateX(0); }
  }
</style>
