<script lang="ts">
  /** Spieleransicht: zeigt nur, was die SL freigibt; Charaktere lassen sich ziehen und antippen. Doppelklick schaltet Vollbild. */
  import { onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  /** Die Abschrift wächst in der Breite auf — so rückt das Bild mit, statt zu springen. */
  function widen(node: HTMLElement) {
    const w = node.offsetWidth;
    return { duration: 450, easing: cubicOut, css: (t: number) => `max-width: ${t * w}px; opacity: ${t}` };
  }
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import MapStage from '$lib/components/battleMap/MapStage.svelte';
  import DiceStage from '$lib/components/battleMap/DiceStage.svelte';
  import type { Roll } from '$lib/services/battleMap/diceLog.svelte';
  import PlayerBadgeMenu from '$lib/components/battleMap/PlayerBadgeMenu.svelte';
  import { onGmMessage, sendToGm, type ShownHandout } from '$lib/services/battleMap/channel';
  import { hpPops, popHp } from '$lib/services/battleMap/hpPops.svelte';
  import { fitRect, pxToCell, snapCell, toImage, type Camera, type Point } from '$lib/services/battleMap/geometry';
  import { clampToView, type PlayerState } from '$lib/services/battleMap/playerState';
  import { isTauri } from '$lib/services/httpFetch';
  import TextTooltip from '$lib/components/TextTooltip.svelte';
  import { textTipState } from '$lib/components/textTip.svelte';
  import { installTitleTips, titleTipState } from '$lib/components/titleTips.svelte';

  let shown = $state<PlayerState | null>(null);
  let handout = $state<ShownHandout | null>(null);
  let vw = $state(0);
  let vh = $state(0);
  let idle = $state(false);
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let drag = $state<{ id: string; grab: Point; at: Point; moved: boolean } | null>(null);
  let menuId = $state<string | null>(null);
  let tips = $state<Record<string, string>>({});
  let dice = $state<{ shown: boolean; roll: Roll | null }>({ shown: false, roll: null });

  function wake() {
    idle = false;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => (idle = true), 2000);
  }

  const img = $derived(shown?.frame ?? { w: 0, h: 0 });
  const view = $derived(shown?.view ?? { x: 0, y: 0, w: img.w, h: img.h });
  const camera = $derived.by((): Camera => {
    if (!shown || !img.w || !vw) return { zoom: 1, tx: 0, ty: 0 };
    return fitRect(view, vw, vh);
  });

  // Bis zum Loslassen gilt die eigene Position — das Echo der SL hinkt einen Frame hinterher.
  const tokens = $derived(
    (shown?.tokens ?? []).map((t) => (drag?.id === t.id ? { ...t, ...drag.at } : t)),
  );

  const MENU = { w: 448, h: 320 };
  const menuToken = $derived(shown?.tokens.find((t) => t.id === menuId) ?? null);
  const menuAt = $derived.by(() => {
    if (!menuToken || !shown) return { left: 0, top: 0 };
    const g = shown.grid;
    const x0 = camera.tx + (g.offsetX + menuToken.x * g.size) * camera.zoom;
    const x1 = camera.tx + (g.offsetX + (menuToken.x + menuToken.size) * g.size) * camera.zoom;
    const top = camera.ty + (g.offsetY + menuToken.y * g.size) * camera.zoom;
    const left = x1 + 8 + MENU.w <= vw ? x1 + 8 : x0 - 8 - MENU.w;
    return { left: Math.max(8, Math.min(left, vw - MENU.w - 8)), top: Math.max(8, Math.min(top, vh - MENU.h - 8)) };
  });

  const cellAt = (e: PointerEvent) => pxToCell(shown!.grid, toImage(camera, { x: e.clientX, y: e.clientY }));

  function onpointerdown(e: PointerEvent) {
    e.preventDefault();
    menuId = null;
    const id = (e.target as Element).closest<HTMLElement>('[data-token-id]')?.dataset.tokenId;
    const t = shown?.tokens.find((x) => x.id === id);
    if (!t?.movable || e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const c = cellAt(e);
    drag = { id: t.id, grab: { x: c.x - t.x, y: c.y - t.y }, at: { x: t.x, y: t.y }, moved: false };
  }

  function onpointermove(e: PointerEvent) {
    wake();
    if (!drag || !shown) return;
    const t = shown.tokens.find((x) => x.id === drag!.id);
    if (!t) return;
    const c = cellAt(e);
    const at = clampToView(shown.grid, view, t.size, { x: c.x - drag.grab.x, y: c.y - drag.grab.y });
    if (Math.hypot(at.x - t.x, at.y - t.y) < 0.15 && !drag.moved) return;
    drag.moved = true;
    drag.at = at;
    sendToGm({ type: 'move', id: t.id, ...drag.at, done: false });
  }

  function onpointerup() {
    const d = drag;
    drag = null;
    const t = d && shown?.tokens.find((x) => x.id === d.id);
    if (!d || !t) return;
    if (!d.moved) {
      menuId = t.id;
      return;
    }
    const x = snapCell(d.at.x, t.size);
    const y = snapCell(d.at.y, t.size);
    t.x = x;
    t.y = y;
    sendToGm({ type: 'move', id: d.id, x, y, done: true });
  }

  onMount(installTitleTips);
  onMount(() => {
    const unlisten = onGmMessage((msg) => {
      if (msg.type === 'state') shown = msg.state;
      else if (msg.type === 'hp') popHp(msg.id, msg.delta);
      else if (msg.type === 'tips') tips = msg.tips;
      else if (msg.type === 'dice') dice = msg;
      else if (msg.type === 'handout') handout = msg.handout;
    });
    sendToGm({ type: 'hello' });
    return () => {
      unlisten();
      clearTimeout(idleTimer);
    };
  });

  async function toggleFullscreen() {
    if (isTauri()) {
      const win = getCurrentWindow();
      await win.setFullscreen(!(await win.isFullscreen()));
    } else if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  }
</script>

<svelte:head><title>Spieleransicht</title></svelte:head>

<TextTooltip text={textTipState.text} x={textTipState.x} y={textTipState.y} />
<TextTooltip plain text={titleTipState.text} x={titleTipState.x} y={titleTipState.y} />

<div
  class="player"
  class:idle
  class:dragging={drag}
  {onpointerdown}
  {onpointermove}
  {onpointerup}
  onpointercancel={onpointerup}
  bind:clientWidth={vw} bind:clientHeight={vh} ondblclick={toggleFullscreen} role="presentation">
  {#if shown?.image.url}
    <MapStage
      mode="player"
      image={shown.image}
      underlay={shown.underlay}
      frame={shown.frame}
      grid={shown.grid}
      {tokens}
      fog={shown.fog}
      lighting={shown.lighting}
      {camera}
      turnId={shown.turn}
      pops={hpPops.list}
      {tips}
    />
    {#key shown.levelName}
      {#if shown.levelName}<div class="level" in:fade={{ duration: 400 }}>{shown.levelName}</div>{/if}
    {/key}
    {#if menuToken}
      <PlayerBadgeMenu
        name={menuToken.name}
        active={menuToken}
        {...menuAt}
        ontoggle={(badge) => sendToGm({ type: 'badge', id: menuToken.id, badge })}
        onclose={() => (menuId = null)}
      />
    {/if}
    {#if img.w}
      <!-- Was neben dem Ausschnitt noch ins Fenster passt, bleibt den Spielern verborgen. -->
      <div
        class="mask"
        style:left="{camera.tx + view.x * camera.zoom}px"
        style:top="{camera.ty + view.y * camera.zoom}px"
        style:width="{view.w * camera.zoom}px"
        style:height="{view.h * camera.zoom}px"
      ></div>
    {/if}
    {#if dice.shown}
      <aside class="dice" aria-label="Würfe der Spielleitung">
        <DiceStage roll={dice.roll ?? undefined} empty="Noch kein Wurf" size={64} />
      </aside>
    {/if}
  {:else if !handout}
    <p class="waiting">Warte auf die Spielleitung…</p>
  {/if}
  {#if handout}
    <figure class="handout" transition:fade={{ duration: 350 }}>
      {#key handout.imageUrl}
        <div class="handout-body" in:scale|global={{ start: 0.92, duration: 450, easing: cubicOut }}>
          <img src={handout.imageUrl} alt={handout.name} />
          {#if handout.text}
            <div class="text-slot" transition:widen><p class="handout-text">{handout.text}</p></div>
          {/if}
        </div>
        <figcaption in:fade|global={{ delay: 200, duration: 400 }}>{handout.name}</figcaption>
      {/key}
    </figure>
  {/if}
</div>

<style>
  :global(body) {
    margin: 0;
    background: #000;
  }
  .player {
    position: fixed;
    inset: 0;
    overflow: hidden;
    background: #000;
    user-select: none;
    touch-action: none;
  }
  .player.dragging {
    cursor: grabbing;
  }
  .mask {
    position: absolute;
    box-shadow: 0 0 0 200vmax #000;
    pointer-events: none;
  }
  .dice {
    position: absolute;
    right: 1rem;
    bottom: 1rem;
    width: 20rem;
    filter: drop-shadow(0 8px 12px rgba(0, 0, 0, 0.7));
    pointer-events: none;
  }
  .player.idle {
    cursor: none;
  }
  .level {
    position: absolute;
    top: 1rem;
    left: 50%;
    transform: translateX(-50%);
    padding: 0.3rem 1.2rem;
    color: #f3e6c8;
    font-family: var(--font-display);
    font-size: 1.3rem;
    background: rgba(12, 10, 16, 0.75);
    border: 1px solid rgba(243, 230, 200, 0.2);
    border-radius: 6px;
    pointer-events: none;
  }
  .handout {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    margin: 0;
    padding: 2vmin;
    box-sizing: border-box;
    background: rgba(0, 0, 0, 0.88);
  }
  .handout-body {
    flex: 1;
    min-height: 0;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .handout img {
    min-width: 0;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  .text-slot {
    flex: none;
    display: flex;
    max-height: 100%;
    overflow: clip;
    overflow-clip-margin: 30px;
  }
  .handout-text {
    flex: none;
    width: 36vw;
    margin: 0 0 0 3vmin;
    padding: 2rem 2.4rem;
    overflow: auto;
    box-sizing: border-box;
    white-space: pre-wrap;
    background: #efe2c2;
    color: #2a1c0e;
    border-radius: 4px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6);
    font-family: var(--font-display);
    font-size: clamp(1.1rem, 2.2vmin, 1.8rem);
    line-height: 1.5;
  }
  .handout figcaption {
    color: #d8c8a0;
    font-family: var(--font-display);
    font-size: 1.3rem;
  }
  .waiting {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0;
    color: #8a7a5a;
    font-family: var(--font-display);
    font-size: 1.5rem;
  }
</style>
