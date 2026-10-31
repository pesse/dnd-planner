<script lang="ts">
  /** Eine Form, die das Formular nicht abbildet: sichtbar, löschbar, sonst nur im JSON änderbar. */
  let { text }: { text: string } = $props();
</script>

<span class="json-only" title="Diese Form ist nur in der JSON-Ansicht änderbar.">{text} <em>(aus JSON)</em></span>

<style>
  .json-only { font-size: 0.85rem; color: var(--ink-soft); }
  em { color: var(--ink-muted); font-size: 0.75rem; }
</style>
