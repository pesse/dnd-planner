<script lang="ts">
  /** Hinweis auf einen Datensatz, den das Schema nicht lesen konnte. */
  let { message, onjson }: { message: string; onjson?: () => void } = $props();
</script>

<p class="parse-error">
  {message}
  {#if onjson}<button onclick={onjson}>JSON bearbeiten</button>{/if}
</p>

<style>
  .parse-error { color: var(--danger); font-size: 0.9rem; }
  .parse-error button {
    background: none; border: none; color: var(--red);
    cursor: pointer; text-decoration: underline; font-family: inherit;
  }
</style>
