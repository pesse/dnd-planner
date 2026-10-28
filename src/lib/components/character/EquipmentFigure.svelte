<script lang="ts">
  /** Figur mit den angelegten Gegenständen an ihrem Platz; die Häkchen im Inventar bleiben die Quelle. */
  import { displayName, type ItemIndex, type ItemInfo } from '../../itemLibrary';
  import { itemKeyArtUrl } from '../../libraryArt';
  import { itemEntry } from '../../services/vaultLinks';
  import { peekEntry } from '../../services/entryPeek';
  import { FIGURE_SOCKETS, figureLinesIn, placeEquipment, type Placed } from '../../services/equipmentSlots';
  import { equipmentQuips } from '../../services/equipmentQuips';
  import { SLOT_LABEL_DE } from '../../schemas/equipmentSlot';
  import { paperdollCandidates, resolveOriginArt } from '../../services/wizard/originArt';
  import { createItemHover } from '../itemHover.svelte';
  import ItemTooltip from '../ItemTooltip.svelte';
  import type { CharacterInventoryEntry, Presentation } from '../../schemas/characterSchema';
  import type { ItemTrainingNote } from '../../services/itemProficiency';

  let { inventory, itemIndex, speciesKey, presentation, ownSrc, trainingOf }: {
    inventory: CharacterInventoryEntry[];
    itemIndex: ItemIndex;
    speciesKey: string;
    presentation: Presentation | undefined;
    /** Die eigene Figur des Charakters; `''`, solange sie lädt — dann blitzt keine Puppe auf. */
    ownSrc?: string;
    trainingOf?: (item: ItemInfo) => ItemTrainingNote | undefined;
  } = $props();

  let paperdoll = $state<string | null>(null);
  $effect(() => {
    let live = true;
    void resolveOriginArt(paperdollCandidates(speciesKey, presentation)).then((url) => {
      if (live) paperdoll = url;
    });
    return () => { live = false; };
  });
  const dollSrc = $derived(ownSrc === undefined ? paperdoll : ownSrc || null);

  const fills = $derived(placeEquipment(figureLinesIn(itemIndex, inventory)));

  const others = $derived(fills.get('other')?.items ?? []);
  const quips = $derived(equipmentQuips(fills));
  let broken = $state(new Set<string>());

  const hover = createItemHover(() => [...fills.values()].flatMap((f) => f.items.map((e) => e.item.path)));
  let hoverNote = $state('');
  let hoverTraining = $state<ItemTrainingNote | undefined>();
  function showTip(ev: MouseEvent, e: Placed) {
    hoverTraining = trainingOf?.(e.item);
    const inside = e.contents?.map((c) => displayName(c.item)).join(', ');
    hoverNote = [inside && `darin: ${inside}`, !e.effective && 'nicht eingestimmt, wirkt nicht'].filter(Boolean).join(' · ');
    hover.show(ev, e.item.path);
  }
</script>

{#snippet icon(e: Placed)}
  {@const src = e.item.key ? itemKeyArtUrl(e.item.key) : null}
  <button type="button" class="eq-icon" class:idle={!e.effective} aria-label={displayName(e.item)}
    onmouseenter={(ev) => showTip(ev, e)} onmousemove={hover.move} onmouseleave={hover.hide}
    onclick={() => { hover.hide(); peekEntry(itemEntry(e.item)); }}>
    {#if src && !broken.has(src)}
      <img {src} alt="" onerror={() => { broken.add(src); broken = new Set(broken); }} />
    {:else}
      <span class="eq-ph">{displayName(e.item).charAt(0)}</span>
    {/if}
  </button>
{/snippet}

<div class="eq-wrap">
  <div class="eq-figure" class:painted={!!dollSrc}>
    {#if dollSrc}
      <img class="eq-doll" src={dollSrc} alt="" />
    {:else}
    <svg viewBox="0 0 200 300" aria-hidden="true">
      <circle cx="100" cy="28" r="20" />
      <path d="M78 52 Q100 60 122 52 L150 66 Q158 70 160 82 L172 150 Q173 158 165 160 L158 160 L146 96
        L142 150 L146 280 Q146 290 136 290 L112 290 L104 170 L96 170 L88 290 L64 290 Q54 290 54 280
        L58 150 L54 96 L42 160 L35 160 Q27 158 28 150 L40 82 Q42 70 50 66 Z" />
    </svg>
    {/if}
    {#each FIGURE_SOCKETS as [slot, x, y, stack]}
      {@const fill = fills.get(slot)}
      <div class="eq-socket" class:empty={!fill} class:dense={(fill?.items.length ?? 0) > 2} class:stack class:inward={stack && x > 50}
        style="left:{x}%;top:{y}%" title={fill ? undefined : `${SLOT_LABEL_DE[slot]}: frei`}>
        {#each fill?.items ?? [] as e (e.line)}{@render icon(e)}{/each}
        {#if quips.has(slot)}
          <button type="button" class="eq-quip" class:left={x > 50} aria-label={quips.get(slot)}>!
            <span class="eq-bubble">{quips.get(slot)}</span>
          </button>
        {/if}
      </div>
    {/each}
  </div>
  {#if others.length}
    <div class="eq-others">
      <span class="eq-others-label">{SLOT_LABEL_DE.other}</span>
      {#each others as e (e.line)}{@render icon(e)}{/each}
    </div>
  {/if}
</div>

<ItemTooltip item={hover.item} x={hover.x} y={hover.y} note={hoverNote} training={hoverTraining} />

<style>
  .eq-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    width: 220px;
  }
  .eq-figure {
    position: relative;
    width: 220px;
    height: 330px;
  }
  .eq-doll {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 12px;
    -webkit-mask-image: radial-gradient(ellipse 50% 50% at 50% 50%, #000 72%, transparent 100%);
    mask-image: radial-gradient(ellipse 50% 50% at 50% 50%, #000 72%, transparent 100%);
  }
  .eq-figure svg {
    width: 100%;
    height: 100%;
    fill: var(--bg-deep);
    stroke: var(--border-strong);
    stroke-width: 1.5;
  }
  .eq-socket {
    position: absolute;
    transform: translate(-50%, -50%);
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    max-width: 88px;
    gap: 3px;
    min-width: 34px;
    min-height: 34px;
    padding: 2px;
    border-radius: 50%;
  }
  .eq-socket.empty {
    border: 1.5px dashed var(--border-strong);
    background: color-mix(in srgb, var(--bg) 60%, transparent);
  }
  .eq-socket.stack {
    flex-direction: column;
    max-height: 140px;
    max-width: none;
  }
  .eq-socket.stack:not(.empty) {
    transform: translate(-21px, -50%);
  }
  .eq-socket.inward:not(.empty) {
    flex-wrap: wrap-reverse;
    transform: translate(calc(21px - 100%), -50%);
  }
  .eq-socket.dense .eq-icon {
    width: 30px;
    height: 30px;
    padding: 1px;
  }
  .painted .eq-socket.empty {
    min-width: 0;
    min-height: 0;
    width: 9px;
    height: 9px;
    padding: 0;
    border: 1.5px solid color-mix(in srgb, var(--gold) 70%, transparent);
    background: color-mix(in srgb, var(--bg) 70%, transparent);
  }
  .eq-icon {
    position: relative;
    width: 38px;
    height: 38px;
    padding: 2px;
    border-radius: 8px;
    border: 1px solid var(--gold);
    background: var(--bg-raised);
    cursor: pointer;
    box-shadow: 0 1px 3px color-mix(in srgb, var(--ink) 25%, transparent);
  }
  .eq-icon:hover {
    border-color: var(--red-bright);
  }
  .eq-icon.idle {
    opacity: 0.45;
    border-style: dashed;
  }
  .eq-icon img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .eq-ph {
    font-family: var(--font-display);
    font-size: 1.1rem;
    color: var(--ink-soft);
  }
  .eq-others {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
  }
  .eq-others-label {
    font-size: 0.8rem;
    color: var(--ink-muted);
    margin-right: 0.3rem;
  }
  .eq-quip {
    position: absolute;
    top: -7px;
    right: -7px;
    z-index: 2;
    width: 17px;
    height: 17px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: var(--copper);
    color: var(--bg);
    font: 700 0.72rem/17px var(--font-display);
    text-align: center;
    cursor: help;
    box-shadow: 0 1px 3px color-mix(in srgb, var(--ink) 35%, transparent);
  }
  .eq-bubble {
    display: none;
    position: absolute;
    top: 20px;
    left: 0;
    width: 190px;
    padding: 0.4rem 0.55rem;
    border-radius: 8px;
    border: 1px solid var(--gold);
    background: var(--bg-raised);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: 0.8rem;
    font-style: italic;
    font-weight: 400;
    line-height: 1.35;
    text-transform: none;
    letter-spacing: normal;
    text-align: left;
    box-shadow: 0 3px 10px color-mix(in srgb, var(--ink) 30%, transparent);
  }
  .eq-quip.left .eq-bubble {
    left: auto;
    right: 0;
  }
  .eq-socket:has(.eq-quip:hover),
  .eq-socket:has(.eq-quip:focus) {
    z-index: 5;
  }
  .eq-quip:hover .eq-bubble,
  .eq-quip:focus .eq-bubble {
    display: block;
  }
</style>
