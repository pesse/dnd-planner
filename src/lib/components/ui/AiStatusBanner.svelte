<script lang="ts">
  let { text, accent = 'red' }: { text: string; accent?: 'red' | 'arcane' } = $props();
</script>

<div class="ai-status">
  <span class="spinner" class:arcane={accent === 'arcane'} aria-hidden="true"></span>
  <span>{text}</span>
</div>

<style>
  .ai-status { display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; color: var(--ink-soft); }
  .spinner {
    width: 0.9rem; height: 0.9rem; flex-shrink: 0;
    border: 2px solid var(--surface); border-top-color: var(--red); border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  .spinner.arcane { border-top-color: var(--arcane, var(--red)); }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
