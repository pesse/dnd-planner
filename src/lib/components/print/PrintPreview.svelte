<script lang="ts">
  /**
   * Zeigt das Druck-HTML in einem sichtbaren Iframe. Die Umbruch-Hilfslinien liegen im
   * Wrapper, nicht im Dokument — sonst würden sie mitgedruckt. `margin` (mm) muss dem
   * `@page` des gezeigten Dokuments folgen, sonst liegen sie falsch.
   */
  let { html, zoom, margin = { x: 4, y: 5 } }: {
    html: string;
    zoom: number;
    margin?: { x: number; y: number };
  } = $props();

  /** A4 abzüglich der Ränder aus `@page`, bei 96 dpi. */
  const PAGE_W = $derived((210 - 2 * margin.x) * (96 / 25.4));
  const PAGE_H = $derived((297 - 2 * margin.y) * (96 / 25.4));

  let frame = $state<HTMLIFrameElement | null>(null);
  let measured = $state({ w: 0, h: 0 });

  const docHeight = $derived(Math.max(measured.h, PAGE_H));
  const docWidth = $derived(Math.max(measured.w, PAGE_W));

  /**
   * Die Seitenzahl steht bei fließendem Inhalt erst nach dem Rendern fest. Auch die Breite
   * wird gemessen: die Zauberkarten drucken randlos und sind damit breiter als der Bogen.
   */
  function measure() {
    const body = frame?.contentDocument?.body;
    if (!body) return;
    measured = { w: body.scrollWidth, h: body.scrollHeight };
  }

  const breaks = $derived(
    Array.from({ length: Math.ceil(docHeight / PAGE_H) - 1 }, (_, i) => (i + 1) * PAGE_H),
  );
</script>

<div class="preview">
  <div class="sizer" style="width: {docWidth * zoom}px; height: {docHeight * zoom}px">
    <div class="stage" style="width: {docWidth}px; height: {docHeight}px; transform: scale({zoom})">
      <iframe bind:this={frame} title="Druckvorschau" srcdoc={html} onload={measure}></iframe>
      {#each breaks as top}
        <div class="pagebreak" style="top: {top}px"></div>
      {/each}
    </div>
  </div>
</div>

<style>
  .preview {
    flex: 1;
    min-width: 0;
    overflow: auto;
    padding: 0.8rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .sizer { margin: 0 auto; }

  .stage {
    position: relative;
    transform-origin: top left;
    background: #fff;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.35);
  }

  iframe {
    width: 100%;
    height: 100%;
    border: none;
    display: block;
  }

  .pagebreak {
    position: absolute;
    left: 0;
    right: 0;
    border-top: 1px dashed var(--danger);
    pointer-events: none;
  }
</style>
