<script lang="ts">
  /** Zeigt eine Szene des Monsters groß im Spielerfenster, über der Karte. */
  import type { Monster } from '../../../types';
  import { monsterArtSlug } from '../../../libraryArt';
  import { loadEntryArt } from '../../../services/libraryEntryArt';
  import { hideHandout, playerHandout, showHandout } from '../../../services/handouts/playerHandout.svelte';

  let { monster }: { monster: Monster } = $props();

  let scenes = $state<string[]>([]);

  $effect(() => {
    const slug = monsterArtSlug(monster);
    let live = true;
    scenes = [];
    void loadEntryArt('monster', slug).then((urls) => { if (live) scenes = urls; });
    return () => { live = false; };
  });

  const shownUrl = $derived(playerHandout.current?.imageUrl ?? '');

  function toggle(url: string) {
    if (shownUrl === url) hideHandout();
    else void showHandout({ name: monster.name, imageUrl: url });
  }
</script>

{#if scenes.length}
  <div class="present">
    {#each scenes as url, i (url)}
      <button class:on={shownUrl === url} title="Szenenbild groß im Spielerfenster zeigen" onclick={() => toggle(url)}>
        {shownUrl === url ? 'Ausblenden' : scenes.length > 1 ? `Szene ${i + 1} zeigen` : 'Den Spielern zeigen'}
      </button>
    {/each}
  </div>
{/if}

<style>
  .present {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  button {
    flex: 1;
    padding: 0.25rem 0.5rem;
    font-size: 0.78rem;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink-soft);
    cursor: pointer;
  }
  button.on {
    background: var(--red);
    border-color: var(--red);
    color: #fff;
  }
</style>
