/**
 * Die Figur mit den angelegten Gegenständen, daneben was wo sitzt. Die Kommentare der Figur
 * stehen als nummerierte Marke am Platz und darunter ausgeschrieben — Papier kennt kein Hover.
 */
import { buildItemIndex, displayName, getAllItemsByDir } from '$lib/itemLibrary';
import { itemInfoArtUrl } from '$lib/libraryArt';
import type { Character } from '$lib/schemas/characterSchema';
import { SLOT_LABEL_DE, type EquipmentSlot } from '$lib/schemas/equipmentSlot';
import { FIGURE_SOCKETS, figureLinesIn, placeEquipment, type Placed, type SlotFill } from '$lib/services/equipmentSlots';
import { equipmentQuips } from '$lib/services/equipmentQuips';
import { paperdollCandidates, resolveOriginArt } from '$lib/services/wizard/originArt';
import { itemCardFacts, type ItemCardFacts } from '$lib/utils/itemCardFacts';
import { renderMarkdown } from '$lib/utils/markdown';
import type { CharacterPrintData } from '../data';
import { loadItem } from '../itemCards';
import { block, esc, row } from '../html';

export interface PrintFigure {
  dollUrl: string;
  fills: Map<EquipmentSlot, SlotFill>;
  /** Item-Bilder, die es gibt; für die übrigen steht der Anfangsbuchstabe. */
  art: Set<string>;
  quips: Map<EquipmentSlot, string>;
  /** Bibliothekspfad → Beschreibung; fehlt die Datei, steht nur der Name. */
  facts: Map<string, ItemCardFacts>;
}

export async function loadPrintFigure(c: Character, ownUrl = ''): Promise<PrintFigure | null> {
  if (!c.inventory?.some((e) => e.equipped)) return null;
  const fills = placeEquipment(figureLinesIn(buildItemIndex(await getAllItemsByDir()), c.inventory));
  const urls = [...new Set([...fills.values()].flatMap((f) => f.items.map((p) => itemInfoArtUrl(p.item) ?? '')).filter(Boolean))];
  const found = await Promise.all(urls.map((u) => resolveOriginArt([u])));
  const paths = [...new Set([...fills.values()].flatMap((f) => f.items.map((p) => p.item.path)))];
  const items = await Promise.all(paths.map(async (path) => [path, await loadItem(path)] as const));
  return {
    dollUrl: ownUrl || ((await resolveOriginArt(paperdollCandidates(c.species.sourceKey, c.presentation))) ?? ''),
    fills,
    art: new Set(found.filter((u): u is string => !!u)),
    quips: equipmentQuips(fills),
    facts: new Map(items.flatMap(([path, item]) => (item ? [[path, itemCardFacts(item, true)] as const] : []))),
  };
}

function icon(f: PrintFigure, p: Placed): string {
  const src = itemInfoArtUrl(p.item);
  const inner = src && f.art.has(src) ? `<img src="${esc(src)}" alt="">` : `<span>${esc(displayName(p.item).charAt(0))}</span>`;
  return `<span class="fig-icon${p.effective ? '' : ' idle'}">${inner}</span>`;
}

/**
 * Nur magische Stücke mit Beschreibung — beim Langschwert stünde bloß „Ein Langschwert.". Ein
 * gepinntes Stück (`printCard`) bekommt seine Karte, hier stünde der Text doppelt.
 */
function itemEntry(f: PrintFigure, p: Placed): string {
  const inside = p.contents?.length ? ` (${p.contents.map((c) => displayName(c.item)).join(', ')})` : '';
  const facts = f.facts.get(p.item.path);
  const desc = p.item.magic && !p.entry.printCard && facts?.description ? `<div class="fig-desc md">${renderMarkdown(facts.description)}</div>` : '';
  return `<div class="fig-item"><b>${esc(displayName(p.item) + inside)}</b>${desc}</div>`;
}

export function renderFigure(d: CharacterPrintData): string {
  const f = d.figure;
  if (!f) return '';
  const marks = new Map([...f.quips.keys()].map((slot, i) => [slot, i + 1]));
  const sockets = FIGURE_SOCKETS.map(([slot, x, y, stack]) => {
    const items = f.fills.get(slot)?.items ?? [];
    if (!items.length) return '';
    const cls = ['fig-socket', stack ? 'stack' : '', stack && x > 50 ? 'inward' : '', items.length > 2 ? 'dense' : '']
      .filter(Boolean).join(' ');
    const mark = marks.has(slot) ? `<span class="fig-mark">${marks.get(slot)}</span>` : '';
    return `<div class="${cls}" style="left:${x}%;top:${y}%">${items.map((p) => icon(f, p)).join('')}${mark}</div>`;
  }).join('');
  const doll = f.dollUrl ? `<img class="fig-doll" src="${esc(f.dollUrl)}" alt="">` : '';

  const rows = [...FIGURE_SOCKETS.map(([slot]) => slot), 'other' as const]
    .filter((slot) => f.fills.get(slot)?.items.length)
    .map((slot) => {
      const mark = marks.has(slot) ? ` <span class="fig-mark inline">${marks.get(slot)}</span>` : '';
      return row(SLOT_LABEL_DE[slot], f.fills.get(slot)!.items.map((p) => itemEntry(f, p)).join('') + mark);
    }).join('');
  const quips = [...f.quips.entries()].map(([slot, text]) =>
    `<div class="fig-quip"><span class="fig-mark inline">${marks.get(slot)}</span> ${esc(text)}</div>`).join('');

  return block('Am Körper', `<div class="fig">${doll}${sockets}</div>` +
    `<div class="fig-list">${rows}${quips ? `<div class="fig-quips">${quips}</div>` : ''}</div>`, { cls: 'wide fig-block' });
}
