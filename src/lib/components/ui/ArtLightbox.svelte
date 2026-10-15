<script lang="ts">
  /** Bibliotheksbild groß über allem; Klick oder Escape schließt. */
  let { src, color, onclose }: { src: string; color: string; onclose: () => void } = $props();

  // An den Body gehängt: ein Vorfahr mit transform/overflow würde `position: fixed` einsperren.
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="art-lightbox" use:portal role="presentation" onclick={onclose} style="--alb-c:{color}">
  <div class="alb-frame">
    <img {src} alt="" />
  </div>
</div>

<style>
  .art-lightbox {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: grid;
    place-items: center;
    background: rgba(20, 12, 4, 0.72);
    cursor: zoom-out;
  }
  .alb-frame {
    width: min(512px, 80vmin);
    aspect-ratio: 1;
    padding: 1rem;
    box-sizing: border-box;
    border-radius: 18px;
    border: 2px solid var(--gold);
    background:
      radial-gradient(circle at 50% 42%,
        color-mix(in srgb, var(--alb-c) 35%, white) 0%,
        color-mix(in srgb, var(--alb-c) 75%, white) 55%,
        var(--alb-c) 100%);
    box-shadow:
      inset 0 0 0 5px var(--bg-panel),
      inset 0 0 0 7px color-mix(in srgb, var(--gold) 70%, transparent),
      inset 0 0 30px rgba(0, 0, 0, 0.25),
      0 12px 40px rgba(0, 0, 0, 0.6);
  }
  .alb-frame img {
    display: block;
    width: 100%;
    height: 100%;
    filter: drop-shadow(0 3px 8px rgba(0, 0, 0, 0.5));
  }
</style>
