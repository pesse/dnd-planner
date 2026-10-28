<script lang="ts">
  /**
   * Was der Ausdruck als Volltext anhängt, in Bogen-Reihenfolge. Gepinnt wird an den Merkmalen
   * der Seitenleiste; hier lässt es sich nur wieder lösen.
   */
  import { untrack } from 'svelte';
  import type { Character } from '../../schemas/characterSchema';
  import { resolveCharacterFeatures, type ResolvedCharacterFeatures } from '../../services/characterFeatures';
  import { createFeaturePins, pinnedFeatures } from '../../services/featurePins';
  import { textTip } from '../textTip.svelte';
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
  <ul class="pin-list">
    {#each entries as f (f.key)}
      <li>
        <span class="pin-name" use:textTip={f.desc}>{f.name}</span>
        {#if f.gainedAt}<span class="pin-lvl">Stufe {f.gainedAt}</span>{/if}
        <PinToggle {pins} featureKey={f.key} />
      </li>
    {/each}
    {#each stale as key (key)}
      <li>
        <span class="pin-name pin-stale" title="Kein Merkmal dieses Keys am Charakter — erscheint nicht im Ausdruck">⚠ {key}</span>
        <PinToggle {pins} featureKey={key} />
      </li>
    {/each}
  </ul>
{/if}

<style>
  .pin-empty { font-size: 0.8rem; color: var(--ink-soft); font-style: italic; margin: 0; }
  .pin-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.2rem; }
  .pin-list li { display: flex; align-items: baseline; gap: 0.5rem; font-size: 0.85rem; }
  .pin-name { cursor: help; }
  .pin-lvl { font-size: 0.72rem; color: var(--ink-soft); }
  .pin-stale { color: var(--copper); }
</style>
