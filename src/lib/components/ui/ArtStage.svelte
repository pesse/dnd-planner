<script lang="ts">
  import type { Snippet } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { isMirroredArt, resolveOriginArt } from '../../services/wizard/originArt';

  /** Karte links, das erste vorhandene Stimmungsbild aus `candidates` rechts darüber hinaus. */
  let { candidates, children }: { candidates: string[]; children: Snippet } = $props();

  let art = $state<string | null>(null);
  $effect(() => {
    const list = candidates;
    let cancelled = false;
    void resolveOriginArt(list).then((url) => { if (!cancelled) art = url; });
    return () => { cancelled = true; };
  });
</script>

<div class="stage" class:with-art={!!art}>
  {#if art}
    {#key art}
      <figure class="art" out:fade={{ duration: 350 }}>
        <img src={art} alt="" class:mirrored={isMirroredArt(art)} in:fly={{ x: 40, duration: 800 }} />
      </figure>
    {/key}
  {/if}
  <div class="card">{@render children()}</div>
</div>

<style>
  .stage {
    --stage-w: var(--fw-detail-w, 100%); --art-w: min(calc(var(--stage-w) * 0.58), 540px);
    /* Eingeklappte Vorschau: die Karte wächst nur bis an den ausgeblendeten Bildrand (40px). */
    --card-w: min(100%, max(calc(var(--stage-w) - var(--art-w) + 120px), calc(100% - var(--art-w) + 40px)));
    display: grid; align-items: start;
  }
  .stage.with-art { grid-template-columns: var(--card-w) minmax(0, 1fr); }
  .card { grid-area: 1 / 1; position: relative; z-index: 1; display: flex; flex-direction: column; gap: 0.6rem; min-width: 0; }
  .with-art .card :global(.lib-card) {
    max-width: none; backdrop-filter: blur(2px);
    background: color-mix(in srgb, var(--bg) 68%, transparent);
    box-shadow: 18px 0 40px -10px rgba(40, 25, 5, 0.2);
  }
  /* Zentriert zwischen Karte und Spaltenrand — das rechte Spalten-Padding zählt zur freien
     Fläche. Reicht der Platz nicht, schneidet `cover` links und rechts gleich viel ab. */
  .art {
    grid-area: 1 / 2; position: sticky; top: 0; justify-self: center;
    margin: 0 calc(-1 * var(--fw-pad-x, 0px)) 0 0;
    width: min(var(--art-w), 100% + var(--fw-pad-x, 0px)); height: calc(100vh - 12rem); pointer-events: none;
    /* Das Einfliegen des Bildes würde sonst die Spalte verbreitern: kurzer horizontaler Scrollbalken. */
    overflow: clip;
    /* Links weich zur Karte hin, rechts kaum: Die Serie blickt nach rechts, dort sitzen die Gesichter. */
    mask-image: linear-gradient(to right, transparent 0%, #000 30%, #000 84%, transparent 100%),
      linear-gradient(to bottom, transparent 0%, #000 10%, #000 78%, transparent 100%);
    mask-composite: intersect;
  }
  .art img { width: 100%; height: 100%; object-fit: cover; object-position: 62% center; }
  .art img.mirrored { transform: scaleX(-1); object-position: 38% center; }
  @media (max-width: 1100px) {
    .art { display: none; }
    .stage.with-art { grid-template-columns: minmax(0, 1fr); }
  }
</style>
