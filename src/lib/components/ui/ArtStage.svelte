<script lang="ts">
  import type { Snippet } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { isMirroredArt, resolveOriginArt } from '../../services/wizard/originArt';
  import ArtPicker from './ArtPicker.svelte';

  /**
   * Karte links, ein Stimmungsbild rechts darüber hinaus: das erste vorhandene aus `candidates`,
   * oder aus `images` (alle vorhanden) mit Picker.
   */
  let { candidates = [], images, whole = false, children }: {
    candidates?: string[];
    images?: string[];
    /** Das ganze Bild statt eines Ausschnitts: die Karte gibt Breite ab. Für Szenen ohne Figur am Rand. */
    whole?: boolean;
    children: Snippet;
  } = $props();

  let probed = $state<string | null>(null);
  $effect(() => {
    if (images) return;
    const list = candidates;
    let cancelled = false;
    void resolveOriginArt(list).then((url) => { if (!cancelled) probed = url; });
    return () => { cancelled = true; };
  });

  let shown = $state(0);
  $effect.pre(() => {
    void images;
    shown = 0;
  });
  let art = $derived(images ? (images[shown] ?? null) : probed);
</script>

<div class="stage" class:with-art={!!art} class:whole>
  {#if art}
    <div class="art-col" class:picking={images && images.length > 1}>
      {#if images && images.length > 1}
        <div class="picker">
          <ArtPicker count={images.length} index={shown} onpick={(i) => (shown = i)} />
        </div>
      {/if}
      {#key art}
        <figure class="art" out:fade={{ duration: 350 }}>
          <img src={art} alt="" class:mirrored={isMirroredArt(art)} in:fly={{ x: 40, duration: 800 }} />
        </figure>
      {/key}
    </div>
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
  .art-col { grid-area: 1 / 2; position: sticky; top: 0; display: grid; min-width: 0; }
  .picker { grid-area: 1 / 1; justify-self: center; max-width: 100%; margin-bottom: 0.5rem; }
  .art {
    grid-area: 2 / 1; justify-self: center;
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
  .picking .art { height: calc(100vh - 14.5rem); }
  .whole.with-art { grid-template-columns: minmax(24rem, 1fr) auto; }
  .whole .art {
    width: auto; aspect-ratio: 2 / 3; margin: 0;
    mask-image: linear-gradient(to right, transparent 0%, #000 8%, #000 94%, transparent 100%),
      linear-gradient(to bottom, transparent 0%, #000 4%, #000 92%, transparent 100%);
  }
  .whole .art img { object-fit: contain; object-position: center; }
  .art img.mirrored { transform: scaleX(-1); object-position: 38% center; }
  @media (max-width: 1100px) {
    .art-col { display: none; }
    .stage.with-art { grid-template-columns: minmax(0, 1fr); }
  }
</style>
