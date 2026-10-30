<script lang="ts">
  import { getSpeciesList, speciesDisplayName } from '$lib/speciesLibrary';
  import { entryArtCandidates, resolveEntryArt, type ArtEntryKind, type EntryArtGroup } from '$lib/services/libraryEntryArt';
  import ArtGallery from '../ui/ArtGallery.svelte';

  let { kind, entryKey }: { kind: ArtEntryKind; entryKey: string } = $props();

  let groups = $state<EntryArtGroup[] | null>(null);

  $effect(() => {
    const k = kind, key = entryKey;
    groups = null;
    let stale = false;
    (async () => {
      const species = (await getSpeciesList())
        .flatMap((s) => (s.key ? [{ key: s.key, name: speciesDisplayName(s) }] : []))
        .sort((a, b) => a.name.localeCompare(b.name, 'de'));
      const found = await resolveEntryArt(entryArtCandidates(k, key, species));
      if (!stale) groups = found;
    })();
    return () => { stale = true; };
  });
</script>

<div class="art">
  {#if !entryKey}
    <p class="empty">Ohne Bibliotheks-Key lassen sich keine Bilder zuordnen.</p>
  {:else if !groups}
    <p class="empty">Bilder werden gesucht …</p>
  {:else if !groups.length}
    <p class="empty">Zu diesem Eintrag gibt es (noch) keine Bilder.</p>
  {:else}
    {#each groups as group (group.title)}
      <section>
        {#if group.title}<h3>{group.title}</h3>{/if}
        <ArtGallery images={group.images} id={(img) => img.url} />
      </section>
    {/each}
  {/if}
</div>

<style>
  .art {
    padding: 1rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  h3 { margin: 0 0 0.6rem; }

  .empty { color: var(--ink-muted); font-size: 0.8rem; margin: 0; }
</style>
