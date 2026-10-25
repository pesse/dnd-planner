<script lang="ts">
  import { peekedEntry } from '../services/entryPeek';
  import { navigateTo } from '../services/navigation';
  import type { FileEntry } from '../types';
  import EntryPeekModal from './ui/EntryPeekModal.svelte';

  // Erst schließen: die Ungespeichert-Rückfrage des Guards läge sonst unter dem Popup.
  function leave(entry: FileEntry) {
    peekedEntry.set(null);
    void navigateTo(entry);
  }
</script>

{#if $peekedEntry}
  {@const entry = $peekedEntry}
  <EntryPeekModal {entry} onclose={() => peekedEntry.set(null)} onleave={() => leave(entry)} />
{/if}
