<script lang="ts">
  /** Die Lage eines Effekts, deutsch für den Bogen und englisch wie im Regeltext. */
  let { target = $bindable() }: { target: { condition?: string; conditionDe?: string } } = $props();
</script>

<input class="edit-input" placeholder="Lage (deutsch), z. B. gegen Fernkampfangriffe" bind:value={target.conditionDe} />
<input class="edit-input en" placeholder="Lage (englisch, Regeltext)" bind:value={target.condition} />

<style>
  .en { font-style: italic; }
</style>
