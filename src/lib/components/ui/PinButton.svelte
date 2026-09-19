<script lang="ts">
  /** Die Nadel „auf den Bogen" — an Merkmalen wie an Inventarzeilen dieselbe. */
  let { on, title, onclick }: { on: boolean; title: string; onclick: () => void } = $props();
</script>

<button type="button" class="pin-btn" class:on aria-pressed={on} {title} {onclick}>📌</button>

<style>
  /* Ungepinnt bleibt die Nadel blass: sie steht an jeder Zeile und darf sie nicht führen. */
  .pin-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0 0.15rem;
    font-size: 0.78rem;
    line-height: 1;
    flex-shrink: 0;
    filter: grayscale(1);
    opacity: 0.35;
  }

  .pin-btn:hover { opacity: 0.8; }
  .pin-btn.on { filter: none; opacity: 1; }
</style>
