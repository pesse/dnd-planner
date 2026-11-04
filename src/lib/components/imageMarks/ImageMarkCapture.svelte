<script lang="ts">
  /** Shift+M schaltet den Markier-Modus; der nächste Klick auf ein Bild öffnet den Editor. */
  import { get } from 'svelte/store';
  import ImageMarkEditor from './ImageMarkEditor.svelte';
  import { activeFile } from '$lib/stores/campaign';
  import { pushNotice } from '$lib/stores/toasts';
  import type { ImageMarkDraft } from '$lib/stores/imageMarks';
  import { imageAddress } from '$lib/services/imageMarks/address';
  import { hitPoint, imageAt, type ImageHit } from '$lib/services/imageMarks/hitTest';
  import { imageFingerprint } from '$lib/services/imageMarks/fingerprint';

  let armed = $state(false);
  let draft = $state<ImageMarkDraft | null>(null);
  let hover = $state<DOMRect | null>(null);
  let banner = $state<HTMLElement | null>(null);

  const editable = (el: EventTarget | null): boolean =>
    el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && armed) {
      armed = false;
      e.stopPropagation();
      return;
    }
    if (e.code !== 'KeyM' || !e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
    if (editable(e.target) || draft) return;
    e.preventDefault();
    armed = !armed;
    hover = null;
  }

  let hoverToken = 0;
  async function onpointermove(e: PointerEvent) {
    if (!armed) return;
    const token = ++hoverToken;
    const hit = await imageAt(e.clientX, e.clientY, banner);
    if (token === hoverToken) hover = hit ? hit.element.getBoundingClientRect() : null;
  }

  function where(hit: ImageHit): string {
    const parts: string[] = [];
    const file = get(activeFile);
    parts.push(file ? `${file.type}: ${file.path}` : 'Startseite');
    const dialog = hit.element.closest('[role="dialog"]')?.getAttribute('aria-label');
    if (dialog) parts.push(`Dialog „${dialog}“`);
    const alt = hit.element.getAttribute('alt') || hit.element.getAttribute('title') || hit.element.getAttribute('data-tip');
    if (alt) parts.push(`„${alt}“`);
    return parts.join(' · ');
  }

  async function mark(e: MouseEvent) {
    const hit = await imageAt(e.clientX, e.clientY, banner);
    if (!hit) {
      pushNotice('An dieser Stelle ist kein Bild. Shift+M erneut drücken, um es noch einmal zu versuchen.');
      return;
    }
    const point = hitPoint(hit, e.clientX, e.clientY);
    draft = {
      address: imageAddress(hit.url),
      url: hit.url.startsWith('data:') ? null : hit.url,
      where: where(hit),
      ...point,
      width: hit.width,
      height: hit.height,
      fingerprint: await imageFingerprint(hit.url),
    };
  }

  /** Im Modus gehört der Klick dem Markieren — die Seite darunter soll ihn nicht sehen. */
  function swallow(e: Event) {
    if (!armed || (e.target instanceof Node && banner?.contains(e.target))) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.type !== 'click') return;
    armed = false;
    hover = null;
    void mark(e as MouseEvent);
  }

  $effect(() => {
    document.documentElement.classList.toggle('image-marking', armed);
  });

  $effect(() => {
    const opts = { capture: true };
    for (const type of ['pointerdown', 'mousedown', 'click'] as const) window.addEventListener(type, swallow, opts);
    return () => {
      for (const type of ['pointerdown', 'mousedown', 'click'] as const) window.removeEventListener(type, swallow, opts);
    };
  });
</script>

<svelte:window onkeydowncapture={onkeydown} {onpointermove} />

{#if armed}
  <div class="banner" bind:this={banner}>
    Bild anklicken, um einen Fehler zu markieren
    <button onclick={() => (armed = false)}>Abbrechen (Esc)</button>
  </div>
  {#if hover}
    <div class="hover" style="left: {hover.left}px; top: {hover.top}px; width: {hover.width}px; height: {hover.height}px;"></div>
  {/if}
{/if}

{#if draft}
  <ImageMarkEditor {draft} onclose={() => (draft = null)} />
{/if}

<style>
  .banner {
    position: fixed;
    top: 0.6rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 20001;
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.45rem 0.6rem 0.45rem 1rem;
    background: var(--bg-raised);
    border: 1px solid var(--danger);
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    font-size: 0.85rem;
    color: var(--ink);
  }
  .banner button {
    background: none;
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.2rem 0.6rem;
    cursor: pointer;
    font: inherit;
    font-size: 0.78rem;
  }
  :global(html.image-marking *) { cursor: crosshair !important; }
  .banner, .banner :global(*) { cursor: default !important; }
  .hover {
    position: fixed;
    z-index: 20000;
    pointer-events: none;
    outline: 2px dashed var(--danger);
    outline-offset: 2px;
    border-radius: 3px;
  }
</style>
