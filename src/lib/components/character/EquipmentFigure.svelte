<script lang="ts">
  /** Figur mit den angelegten Gegenständen an ihrem Platz; die Häkchen im Inventar bleiben die Quelle. */
  import { displayName, type ItemIndex } from '../../itemLibrary';
  import { itemKeyArtUrl } from '../../libraryArt';
  import { openItemPage } from '../../services/vaultLinks';
  import { equippedLinesIn } from '../../services/wornItems';
  import { placeEquipment, type Placed } from '../../services/equipmentSlots';
  import { SLOT_LABEL_DE, type EquipmentSlot } from '../../schemas/equipmentSlot';
  import { paperdollCandidates, resolveOriginArt } from '../../services/wizard/originArt';
  import type { CharacterInventoryEntry, Presentation } from '../../schemas/characterSchema';

  let { inventory, itemIndex, speciesKey, presentation }: {
    inventory: CharacterInventoryEntry[];
    itemIndex: ItemIndex;
    speciesKey: string;
    presentation: Presentation | undefined;
  } = $props();

  let dollSrc = $state<string | null>(null);
  $effect(() => {
    let live = true;
    void resolveOriginArt(paperdollCandidates(speciesKey, presentation)).then((url) => {
      if (live) dollSrc = url;
    });
    return () => { live = false; };
  });

  const fills = $derived(placeEquipment(equippedLinesIn(itemIndex, inventory)));

  /**
   * Position der Fassung in Prozent (x, y), `stack` stapelt mehrere Stücke senkrecht. Die rechte
   * Seite des Charakters liegt vom Betrachter aus links.
   */
  const SOCKETS: [slot: EquipmentSlot, x: number, y: number, stack?: boolean][] = [
    ['head', 50, 7], ['eyes', 70, 9], ['neck', 50, 24], ['shoulders', 26, 21], ['back', 76, 21, true],
    ['body', 50, 36], ['arms', 14, 40, true], ['ring', 86, 40, true], ['waist', 50, 50],
    ['hipRight', 30, 56, true], ['hipLeft', 70, 56, true], ['boot', 24, 88], ['feet', 50, 93],
  ];

  const others = $derived(fills.get('other')?.items ?? []);
  const spares = $derived([...fills.values()].filter((f) => f.items.some((e) => e.spare)));
  let broken = $state(new Set<string>());
</script>

{#snippet icon(e: Placed)}
  {@const src = e.item.key ? itemKeyArtUrl(e.item.key) : null}
  <button type="button" class="eq-icon" class:idle={!e.effective || e.spare}
    title="{displayName(e.item)}{e.spare ? ' — man trägt nur eins zur Zeit' : e.effective ? '' : ' — nicht eingestimmt, wirkt nicht'}"
    onclick={() => openItemPage(e.item)}>
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
    {#each SOCKETS as [slot, x, y, stack]}
      {@const fill = fills.get(slot)}
      <div class="eq-socket" class:empty={!fill} class:dense={(fill?.items.length ?? 0) > 2} class:stack
        style="left:{x}%;top:{y}%" title={fill ? undefined : `${SLOT_LABEL_DE[slot]}: frei`}>
        {#each fill?.items ?? [] as e (e.line)}{@render icon(e)}{/each}
      </div>
    {/each}
  </div>
  {#if others.length}
    <div class="eq-others">
      <span class="eq-others-label">{SLOT_LABEL_DE.other}</span>
      {#each others as e (e.line)}{@render icon(e)}{/each}
    </div>
  {/if}
  {#each spares as f}
    <p class="eq-note">{SLOT_LABEL_DE[f.slot]}: {f.items.map((e) => displayName(e.item)).join(', ')} —
      man trägt nur eins zur Zeit, {displayName(f.items[0].item)} ist angelegt</p>
  {/each}
</div>

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
    max-height: 132px;
    max-width: none;
  }
  .eq-socket.dense .eq-icon {
    width: 30px;
    height: 30px;
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
  .eq-note {
    margin: 0;
    font-size: 0.8rem;
    font-style: italic;
    color: var(--ink-muted);
  }
</style>
