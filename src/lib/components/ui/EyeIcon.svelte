<script lang="ts">
  /** Sichtbarkeit für Spieler: offenes oder geschlossenes Auge in Textfarbe. */
  let { closed = false }: { closed?: boolean } = $props();
</script>

<svg class="eye-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  {#if closed}
    <path d="M2 10c2.8 3.6 6 5.4 10 5.4s7.2-1.8 10-5.4" />
    <path d="M5.2 13.4 3.6 15.6M9.2 15 8.4 17.6M14.8 15l.8 2.6M18.8 13.4l1.6 2.2" />
  {:else}
    <path d="M2 12c2.8-4.4 6-6.6 10-6.6s7.2 2.2 10 6.6c-2.8 4.4-6 6.6-10 6.6S4.8 16.4 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  {/if}
</svg>

<style>
  .eye-icon {
    width: 1.1em;
    height: 1.1em;
    vertical-align: -0.18em;
  }
</style>
