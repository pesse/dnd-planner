<script lang="ts">
  import '../tree.css';

  let { ondelete }: { ondelete: () => void } = $props();
</script>

<button class="entry-del" title="Löschen" onclick={(e) => { e.stopPropagation(); ondelete(); }}>🗑</button>
