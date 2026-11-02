<script lang="ts">
  import { pointOnImage } from '$lib/services/imageMarks/address';

  let {
    url,
    width,
    height,
    pins,
    maxHeight = '14rem',
    onpick,
  }: {
    url: string | null;
    width: number;
    height: number;
    pins: { x: number; y: number; current?: boolean }[];
    maxHeight?: string;
    /** Ohne `onpick` ist die Markierung fest. */
    onpick?: (p: { x: number; y: number }) => void;
  } = $props();

  let failed = $state(false);
  const aspect = $derived(width > 0 && height > 0 ? width / height : 1);

  function pick(e: MouseEvent) {
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onpick?.(pointOnImage(box, { width, height }, { fit: 'fill', position: '0 0', flipX: false }, e.clientX, e.clientY));
  }
</script>

<div class="frame" style="width: min(100%, calc({maxHeight} * {aspect})); aspect-ratio: {aspect};">
  {#if url && !failed}
    <img src={url} alt="" onerror={() => (failed = true)} />
  {:else}
    <span class="missing">Bild nicht verfügbar</span>
  {/if}
  {#if onpick}
    <button class="picker" title="Klicken, um die Markierung zu versetzen" onclick={pick}></button>
  {/if}
  {#each pins as p, i (i)}
    <span class="pin" class:current={p.current} style="left: {p.x * 100}%; top: {p.y * 100}%;"></span>
  {/each}
</div>

<style>
  .frame {
    position: relative;
    margin: 0 auto;
    background: var(--surface);
    border-radius: 4px;
  }
  img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: fill;
    border-radius: 4px;
  }
  .missing {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-size: 0.75rem;
    color: var(--ink-muted);
  }
  .picker {
    position: absolute;
    inset: 0;
    background: none;
    border: none;
    padding: 0;
    cursor: crosshair;
  }
  .pin {
    position: absolute;
    width: 0.9rem;
    height: 0.9rem;
    transform: translate(-50%, -50%);
    border: 2px solid var(--bg);
    border-radius: 50%;
    background: var(--danger);
    box-shadow: 0 0 0 2px var(--danger), 0 1px 4px rgba(0, 0, 0, 0.6);
    pointer-events: none;
  }
  .pin:not(.current) { opacity: 0.55; }
  .pin.current { background: var(--gold); box-shadow: 0 0 0 2px var(--danger), 0 0 8px var(--gold); }
</style>
