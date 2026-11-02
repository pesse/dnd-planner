<script lang="ts">
  /** SL-Arbeitsfläche: Zeigerbedienung je Werkzeug, Lineal, Spieler-Rahmen. */
  import type { FogOp, ViewRect } from '../../schemas/battleMap';
  import type { MapEditor } from '../../services/battleMap/mapEditor.svelte';
  import {
    distanceCells,
    fitRect,
    formatMeters,
    normalizeRect,
    pxToCell,
    snapCell,
    toImage,
    visibleRect,
    zoomAt,
    type Camera,
    type Point,
  } from '../../services/battleMap/geometry';
  import {
    CORNERS,
    FRAME_CURSOR,
    cornerPoint,
    hitFrame,
    moveFrame,
    resizeFrame,
    scaleFrame,
    type FrameHit,
  } from '../../services/battleMap/viewFrame';
  import MapStage from './MapStage.svelte';

  let { editor }: { editor: MapEditor } = $props();

  type Drag =
    | { kind: 'pan'; start: Point; cam: Camera }
    | { kind: 'token'; id: string; grab: Point; moved: boolean }
    | { kind: 'light'; id: string }
    | { kind: 'rect'; a: Point; b: Point }
    | { kind: 'brush'; op: Extract<FogOp, { shape: 'brush' }> }
    | { kind: 'ruler'; a: Point; b: Point }
    | { kind: 'frame'; hit: FrameHit | 'new'; start: ViewRect | null; from: Point };

  let viewport = $state<HTMLDivElement>();
  let vw = $state(0);
  let vh = $state(0);
  let camera = $state<Camera>({ zoom: 1, tx: 0, ty: 0 });
  let drag = $state<Drag | null>(null);
  let hover = $state<Point | null>(null);
  let fitted = '';

  const map = $derived(editor.map!);
  const tokens = $derived(map.tokens.map((t) => ({ ...t, imageUrl: editor.tokenImages[t.id] ?? '' })));

  export function fit() {
    const { w, h } = editor.imageSize;
    if (!w || !vw) return;
    camera = fitRect({ x: 0, y: 0, w, h }, vw, vh);
  }

  export const visible = () => visibleRect(camera, vw, vh);

  $effect(() => {
    const key = `${editor.path}|${editor.imageSize.w}`;
    if (editor.imageSize.w && vw && fitted !== key) {
      fitted = key;
      fit();
    }
  });

  function local(e: PointerEvent | WheelEvent): Point {
    const r = viewport!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  const imagePoint = (e: PointerEvent | WheelEvent): Point => toImage(camera, local(e));

  function onpointerdown(e: PointerEvent) {
    // Sonst landen die Werkzeug-Tasten im zuletzt benutzten Panel-Feld.
    (document.activeElement as HTMLElement | null)?.blur();
    // Sonst startet der Browser auf Token-Namen eine Textauswahl samt eigenem Drag & Drop.
    e.preventDefault();
    viewport!.setPointerCapture(e.pointerId);
    const p = imagePoint(e);
    if (e.button === 1 || e.button === 2) {
      drag = { kind: 'pan', start: local(e), cam: { ...camera } };
      return;
    }
    const target = e.target as Element;
    const lightId = target.closest<SVGElement>('[data-light-id]')?.dataset.lightId;
    const tool = editor.tool;

    if (tool === 'select' || tool === 'light') {
      if (lightId && tool === 'light') {
        editor.checkpoint();
        drag = { kind: 'light', id: lightId };
        return;
      }
      const tokenId = target.closest<HTMLElement>('[data-token-id]')?.dataset.tokenId;
      if (tokenId && tool === 'select') {
        const t = map.tokens.find((x) => x.id === tokenId)!;
        const cell = pxToCell(map.grid, p);
        editor.selectedId = tokenId;
        editor.checkpoint();
        drag = { kind: 'token', id: tokenId, grab: { x: cell.x - t.x, y: cell.y - t.y }, moved: false };
        return;
      }
      if (tool === 'light') {
        editor.addLight(p);
        return;
      }
      editor.selectedId = null;
      drag = { kind: 'pan', start: local(e), cam: { ...camera } };
      return;
    }
    if (tool === 'reveal-brush' || tool === 'cover-brush') {
      editor.checkpoint();
      const op: Extract<FogOp, { shape: 'brush' }> = {
        shape: 'brush',
        mode: tool === 'reveal-brush' ? 'reveal' : 'cover',
        r: editor.brushRadius,
        points: [[p.x, p.y]],
      };
      editor.addFogOp(op);
      drag = { kind: 'brush', op: map.fog.ops[map.fog.ops.length - 1] as typeof op };
      return;
    }
    if (tool === 'view') {
      const hit = playerFrame ? hitFrame(playerFrame, p, handleTol) : null;
      drag = { kind: 'frame', hit: hit ?? 'new', start: playerFrame, from: p };
      return;
    }
    if (tool === 'ruler') drag = { kind: 'ruler', a: p, b: p };
    else drag = { kind: 'rect', a: p, b: p };
  }

  function onpointermove(e: PointerEvent) {
    const p = imagePoint(e);
    hover = p;
    if (!drag) return;
    if (drag.kind === 'pan') {
      const s = local(e);
      camera = { ...drag.cam, tx: drag.cam.tx + s.x - drag.start.x, ty: drag.cam.ty + s.y - drag.start.y };
    } else if (drag.kind === 'token') {
      const cell = pxToCell(map.grid, p);
      drag.moved = true;
      editor.updateToken(drag.id, { x: cell.x - drag.grab.x, y: cell.y - drag.grab.y });
    } else if (drag.kind === 'light') {
      const l = map.lighting.lights.find((x) => x.id === (drag as { id: string }).id);
      if (l) Object.assign(l, { x: p.x, y: p.y });
      editor.changed();
    } else if (drag.kind === 'frame') {
      editor.setPlayerView(draggedFrame(drag, p));
    } else if (drag.kind === 'brush') {
      const last = drag.op.points[drag.op.points.length - 1];
      // Dünnt den Strich aus, sonst wächst die Datei mit jedem Mauspixel.
      if (Math.hypot(p.x - last[0], p.y - last[1]) < drag.op.r / 3) return;
      drag.op.points.push([p.x, p.y]);
      editor.changed();
    } else {
      drag.b = p;
    }
  }

  function onpointerup(e: PointerEvent) {
    viewport?.releasePointerCapture(e.pointerId);
    const d = drag;
    drag = null;
    if (!d) return;
    if (d.kind === 'token') {
      const t = map.tokens.find((x) => x.id === d.id);
      if (t) editor.updateToken(t.id, { x: snapCell(t.x, t.size), y: snapCell(t.y, t.size) });
    } else if (d.kind === 'frame') {
      const r = editor.map?.playerView;
      // Ein bloßer Klick daneben soll den bisherigen Ausschnitt nicht zu einem Punkt schrumpfen.
      if (d.hit === 'new' && r && r.w * camera.zoom < 20) editor.setPlayerView(d.start);
    } else if (d.kind === 'rect') {
      const r = normalizeRect(d.a, d.b);
      if (editor.tool === 'grid') editor.calibrateGrid(r);
      else if (r.w > 2 && r.h > 2) {
        editor.checkpoint();
        editor.addFogOp({ shape: 'rect', mode: editor.tool === 'reveal-rect' ? 'reveal' : 'cover', ...r });
      }
    }
  }

  function draggedFrame(d: Extract<Drag, { kind: 'frame' }>, p: Point): ViewRect {
    if (d.hit === 'new' || !d.start) return normalizeRect(d.from, p);
    if (d.hit === 'move') return moveFrame(d.start, d.from, p);
    return resizeFrame(d.start, d.hit, p);
  }

  function onwheel(e: WheelEvent) {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    const p = imagePoint(e);
    if (editor.tool === 'view' && playerFrame && hitFrame(playerFrame, p, handleTol)) {
      editor.setPlayerView(scaleFrame(playerFrame, 1 / factor, map.grid.size * 2));
      return;
    }
    camera = zoomAt(camera, local(e), factor);
  }

  const svgRect = (r: ViewRect) => ({ x: r.x, y: r.y, width: r.w, height: r.h });

  const rect = $derived(drag?.kind === 'rect' ? normalizeRect(drag.a, drag.b) : null);
  const ruler = $derived(drag?.kind === 'ruler' ? drag : null);
  const playerFrame = $derived(map.playerView);
  const handleTol = $derived(12 / camera.zoom);
  const frameCursor = $derived.by(() => {
    if (editor.tool !== 'view' || !hover || !playerFrame) return '';
    const hit = hitFrame(playerFrame, hover, handleTol);
    return hit ? FRAME_CURSOR[hit] : '';
  });
  const stroke = $derived(2 / camera.zoom);
  const brushPreview = $derived(
    hover && (editor.tool === 'reveal-brush' || editor.tool === 'cover-brush') ? hover : null,
  );
</script>

<div
  class="viewport tool-{editor.tool}"
  style:cursor={frameCursor || null}
  bind:this={viewport}
  bind:clientWidth={vw}
  bind:clientHeight={vh}
  role="application"
  aria-label="Kampfkarte"
  {onpointerdown}
  {onpointermove}
  {onpointerup}
  onpointercancel={onpointerup}
  ondragstart={(e) => e.preventDefault()}
  onpointerleave={() => (hover = null)}
  {onwheel}
  oncontextmenu={(e) => e.preventDefault()}
>
  <MapStage
    mode="gm"
    imageUrl={editor.imageUrl}
    grid={map.grid}
    {tokens}
    fog={map.fog}
    lighting={map.lighting}
    {camera}
    selectedId={editor.selectedId}
    onimagesize={(w, h) => (editor.imageSize = { w, h })}
  >
    {#snippet overlay({ w, h })}
      <svg class="gm-overlay" width={w} height={h} aria-hidden="true">
        {#if playerFrame}
          <rect {...svgRect(playerFrame)} class="player-frame" stroke-width={stroke * 1.5} stroke-dasharray="{stroke * 8} {stroke * 5}" />
          <text x={playerFrame.x + 6 / camera.zoom} y={playerFrame.y + 18 / camera.zoom} font-size={14 / camera.zoom} class="frame-label">Spieleransicht</text>
          {#if editor.tool === 'view'}
            <rect {...svgRect(playerFrame)} class="frame-fill" />
            {#each CORNERS as c}
              {@const q = cornerPoint(playerFrame, c)}
              <rect x={q.x - handleTol / 2} y={q.y - handleTol / 2} width={handleTol} height={handleTol} class="frame-handle" stroke-width={stroke} />
            {/each}
          {/if}
        {/if}
        {#each map.lighting.lights as l (l.id)}
          <circle cx={l.x} cy={l.y} r={l.radius * map.grid.size} class="light-range" stroke-width={stroke} />
          <circle cx={l.x} cy={l.y} r={9 / camera.zoom} class="light-handle" class:active={editor.tool === 'light'} data-light-id={l.id} style="fill: {l.color}" stroke-width={stroke} />
        {/each}
        {#if rect}
          <rect {...svgRect(rect)} class="drag-rect tool-{editor.tool}" stroke-width={stroke} />
        {/if}
        {#if brushPreview}
          <circle cx={brushPreview.x} cy={brushPreview.y} r={editor.brushRadius} class="brush-preview" stroke-width={stroke} />
        {/if}
        {#if ruler}
          <line x1={ruler.a.x} y1={ruler.a.y} x2={ruler.b.x} y2={ruler.b.y} class="ruler" stroke-width={stroke * 2} />
          <text x={ruler.b.x + 10 / camera.zoom} y={ruler.b.y - 10 / camera.zoom} font-size={16 / camera.zoom} class="ruler-label">
            {formatMeters(distanceCells(map.grid, ruler.a, ruler.b), map.grid.metersPerCell)}
          </text>
        {/if}
      </svg>
    {/snippet}
  </MapStage>

  {#if !editor.imageUrl}
    <div class="empty">
      <p>Diese Karte hat noch kein Bild.</p>
      <button onclick={() => editor.chooseImage()}>Kartenbild wählen…</button>
    </div>
  {/if}
</div>

<style>
  .viewport {
    position: relative;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    background: #1b1712;
    touch-action: none;
    user-select: none;
    cursor: grab;
  }
  .viewport:not(.tool-select) {
    cursor: crosshair;
  }
  .gm-overlay {
    position: absolute;
    inset: 0;
    overflow: visible;
    pointer-events: none;
  }
  .player-frame {
    fill: none;
    stroke: #6fc3ff;
  }
  .frame-fill {
    fill: rgba(111, 195, 255, 0.08);
  }
  .frame-handle {
    fill: #fff;
    stroke: #6fc3ff;
  }
  .frame-label {
    fill: #6fc3ff;
    font-family: var(--font-ui);
  }
  .light-range {
    fill: none;
    stroke: rgba(255, 200, 100, 0.6);
  }
  .light-handle {
    stroke: #000;
    pointer-events: none;
  }
  .light-handle.active {
    pointer-events: auto;
    cursor: move;
  }
  .drag-rect {
    fill: rgba(255, 255, 255, 0.15);
    stroke: #fff;
  }
  .drag-rect.tool-cover-rect {
    fill: rgba(0, 0, 0, 0.35);
  }
  .drag-rect.tool-grid {
    fill: rgba(111, 195, 255, 0.2);
    stroke: #6fc3ff;
  }
  .brush-preview {
    fill: none;
    stroke: #fff;
  }
  .ruler {
    stroke: #ffd36b;
  }
  .ruler-label {
    fill: #ffd36b;
    font-weight: 700;
    paint-order: stroke;
    stroke: #000;
    stroke-width: 0.25em;
    font-family: var(--font-ui);
  }
  .empty {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    color: var(--on-accent);
  }
  .empty button {
    padding: 0.4rem 1rem;
    cursor: pointer;
  }
</style>
