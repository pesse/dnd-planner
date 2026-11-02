<script lang="ts">
  /** Die Lese-Karte eines Bibliothekseintrags neben seinen Bildern, bei mehreren mit Picker. */
  import type { Snippet } from 'svelte';
  import { loadEntryArt, type ArtEntryKind } from '$lib/services/libraryEntryArt';
  import ArtStage from '../ui/ArtStage.svelte';

  let { kind, entryKey, parentKey, children }: {
    kind: ArtEntryKind;
    entryKey: string;
    parentKey?: string;
    children: Snippet;
  } = $props();

  let images = $state<string[]>([]);
  $effect(() => {
    const k = kind, key = entryKey, parent = parentKey;
    let stale = false;
    void loadEntryArt(k, key, parent).then((urls) => { if (!stale) images = urls; });
    return () => { stale = true; };
  });
</script>

<ArtStage whole {images}>{@render children()}</ArtStage>
