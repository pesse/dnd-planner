<script lang="ts">
  /** Markiertes Bild groß über allem; Klick aufs Bild versetzt die Markierung, daneben oder Escape schließt. */
  import { portal } from '../../utils/portal';
  import MarkedImage from './MarkedImage.svelte';

  let {
    url,
    width,
    height,
    pins,
    onpick,
    onclose,
  }: {
    url: string | null;
    width: number;
    height: number;
    pins: { x: number; y: number; current?: boolean }[];
    onpick?: (p: { x: number; y: number }) => void;
    onclose: () => void;
  } = $props();
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="lightbox" use:portal role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="image">
    <MarkedImage {url} {width} {height} {pins} {onpick} maxHeight="88vh" />
  </div>
</div>

<style>
  .lightbox {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: grid;
    place-items: center;
    padding: 2vh 2vw;
    box-sizing: border-box;
    background: rgba(20, 12, 4, 0.8);
    cursor: zoom-out;
  }
  .image { width: 96vw; pointer-events: none; }
  .image > :global(*) { pointer-events: auto; cursor: default; }
</style>
