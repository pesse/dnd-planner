/** Die im Bilder-Reiter markierten Bilder als randlose Karten, Bildunterschrift unten auf dem Bild. */
import { cardPages } from '$lib/utils/printCards';
import type { CharacterPrintData } from './data';
import { CARDS_PAGE_CLASS } from './css/cards';
import { esc } from './html';

export interface PrintImage {
  url: string;
  label: string;
}

const imageCard = (img: PrintImage): string =>
  `<div class="card img-card"><img src="${esc(img.url)}" alt="">` +
  (img.label.trim() ? `<div class="img-cap">${esc(img.label)}</div>` : '') +
  `</div>`;

export const renderImageCards = (d: CharacterPrintData): string =>
  cardPages(d.images.map(imageCard), CARDS_PAGE_CLASS).join('\n');
