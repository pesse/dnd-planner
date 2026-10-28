<script lang="ts">
  /**
   * Was der Ausdruck als Volltext anhängt, in Bogen-Reihenfolge. Gepinnt wird an den Merkmalen
   * der Seitenleiste; hier lässt es sich nur wieder lösen.
   */
  import { untrack } from 'svelte';
  import type { Character } from '../../schemas/characterSchema';
  import { resolveCharacterFeatures, type ResolvedCharacterFeatures } from '../../services/characterFeatures';
  import { createFeaturePins, pinnedFeatures } from '../../services/featurePins';
  import Markdown from '../Markdown.svelte';
  import PinToggle from '../featurePanel/PinToggle.svelte';
  import './form.css';

  let { character }: { character: Character } = $props();

  const pins = createFeaturePins(() => character);

  // Nur die Links lösen neu auf — ein Klick auf die Nadel filtert bloß.
  const linkKey = $derived(JSON.stringify([
    character.classes, character.species, character.backgroundRef,
    (character.features ?? []).map((e) => [e.sourceKey, e.name, e.gainedAt]),
  ]));

  let resolved = $state<ResolvedCharacterFeatures | null>(null);
  $effect(() => {
    void linkKey;
    const c = untrack(() => $state.snapshot(character)) as Character;
    let cancelled = false;
    void resolveCharacterFeatures(c).then((r) => { if (!cancelled) resolved = r; });
    return () => { cancelled = true; };
  });

  const entries = $derived(resolved ? pinnedFeatures(resolved, character.pinnedFeatures) : []);
  // Der Bogen lässt sie stillschweigend weg; hier sollen sie sich entfernen lassen.
  const stale = $derived(resolved
    ? (character.pinnedFeatures ?? []).filter((k) => !entries.some((f) => f.key === k))
    : []);
</script>

<h3>Gepinnte Merkmale</h3>
{#if !character.pinnedFeatures?.length}
  <p class="pin-empty">Nichts gepinnt — 📌 an einem Merkmal der Seitenleiste hängt es im Volltext an den Ausdruck.</p>
{:else}
  <div class="pin-cards">
    {#each entries as f (f.key)}
      <article class="pin-card">
        <h4>
          {f.name}
          {#if f.gainedAt}<span class="pin-lvl">Stufe {f.gainedAt}</span>{/if}
          <span class="pin"><PinToggle {pins} featureKey={f.key} /></span>
        </h4>
        {#if f.desc}<Markdown source={f.desc} />{/if}
      </article>
    {/each}
    {#each stale as key (key)}
      <article class="pin-card stale">
        <h4>⚠ {key}<span class="pin"><PinToggle {pins} featureKey={key} /></span></h4>
        <p class="pin-empty">Kein Merkmal dieses Keys am Charakter — erscheint nicht im Ausdruck.</p>
      </article>
    {/each}
  </div>
{/if}

<style>
  .pin-empty { font-size: 0.8rem; color: var(--ink-soft); font-style: italic; margin: 0; }
  .pin-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr)); gap: 0.6rem; align-items: start; }
  .pin-card {
    border: 1px solid var(--border); border-radius: 6px; background: var(--surface);
    padding: 0.6rem 0.8rem; font-size: 0.82rem; color: var(--ink-soft);
  }
  .pin-card.stale { border-color: var(--copper); }
  h4 { margin: 0 0 0.3rem; font-size: 0.9rem; color: var(--ink); display: flex; align-items: baseline; gap: 0.4rem; }
  .pin-lvl { font-size: 0.72rem; font-weight: normal; color: var(--ink-soft); }
  .pin { margin-left: auto; }
</style>
