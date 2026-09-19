/**
 * Das Kartenwerk hinter Zauber- und Gegenstandskarten: Beschreibung im DOM ausmessen, auf
 * Folgekarten verteilen, Karten zu 3×3-Seiten binden. Die Schale liefert der Aufrufer.
 */
import { createHtmlFitter, paginateMarkdown } from './paginateMarkdown';
import {
  CARD_CSS,
  DESC_PADDING,
  DESC_WIDTH,
  FONT_FAMILY,
  FONT_SIZE,
  LINE_HEIGHT,
} from './printCardCss';

export interface CardShell {
  /** Die fertige Karte mit eingesetztem Beschreibungs-HTML; `page` ist 0-basiert. */
  render(descHtml: string, page: number, isLast: boolean): string;
  /** Markdown, das über die Karten läuft. */
  description: string;
  /** Steht nur auf der letzten Karte und wird mitgemessen („Auf höheren Graden."). */
  tail?: string;
}

// Höhe 0 meldet ein DOM ohne Layout (jsdom). Und zu klein gemessen schneidet die Pagination
// Wort für Wort — sie füllte Karten ohne Ende, deshalb die Untergrenze.
const FALLBACK_FIRST_H = 180;
const FALLBACK_CONT_H = 300;
const MIN_DESC_H = 40;

const CARDS_PER_PAGE = 9;

/**
 * Misst den Beschreibungsbereich an leeren Karten im unsichtbaren DOM, statt ihn zu schätzen:
 * wie viele Zeilen der Kopf braucht, steht erst nach dem Umbruch fest.
 */
function measureDescHeights(shell: CardShell, doc: Document): { firstH: number; contH: number } {
  const wrapper = doc.createElement('div');
  wrapper.style.cssText = 'position:fixed;top:-9999px;left:-9999px;';

  const styleEl = doc.createElement('style');
  styleEl.textContent = CARD_CSS;
  wrapper.appendChild(styleEl);

  // Beide Schalen ohne Text: `.desc` hat flex:1 und meldet damit den freien Rest.
  wrapper.insertAdjacentHTML('beforeend', shell.render('', 0, false));
  wrapper.insertAdjacentHTML('beforeend', shell.render('', 1, false));

  doc.body.appendChild(wrapper);

  const descs = wrapper.querySelectorAll('.desc');
  const firstH = (descs[0] as HTMLElement | null)?.clientHeight || FALLBACK_FIRST_H;
  const contH = (descs[1] as HTMLElement | null)?.clientHeight || FALLBACK_CONT_H;

  doc.body.removeChild(wrapper);
  return { firstH: Math.max(firstH, MIN_DESC_H), contH: Math.max(contH, MIN_DESC_H) };
}

function paginateDescription(shell: CardShell, doc: Document): string[] {
  if (!shell.description.trim()) return [''];
  const { firstH, contH } = measureDescHeights(shell, doc);

  const fitter = createHtmlFitter({
    doc,
    fontFamily: FONT_FAMILY,
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    width: DESC_WIDTH,
    padding: DESC_PADDING, // identisch zur .desc-Klasse — sonst zu viel Text gemessen
  });

  try {
    return paginateMarkdown(shell.description, {
      heightOf: (page) => (page === 0 ? firstH : contH),
      fits: fitter.fits,
      tailHtml: shell.tail ?? '',
    });
  } finally {
    fitter.destroy();
  }
}

const cardsOfChunks = (shell: CardShell, chunks: string[]): string[] =>
  chunks.map((chunk, i) => shell.render(chunk, i, i === chunks.length - 1));

export const measuredCards = (shells: CardShell[], doc: Document): string[] =>
  shells.flatMap((shell) => cardsOfChunks(shell, paginateDescription(shell, doc)));

/** Angebrochene Seiten füllen Leerkarten auf (3×3-Raster). */
export function cardPages(cards: string[], pageClass: string): string[] {
  const pages: string[] = [];
  for (let i = 0; i < cards.length; i += CARDS_PER_PAGE) {
    const batch = cards.slice(i, i + CARDS_PER_PAGE);
    while (batch.length < CARDS_PER_PAGE) batch.push('<div class="card empty"></div>');
    pages.push(`<div class="${pageClass}">\n${batch.join('\n')}\n</div>`);
  }
  return pages;
}

/** `title` ist bereits escaped. */
export function cardDocument(title: string, cards: string[]): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>${CARD_CSS}</style>
</head>
<body>
${cardPages(cards, 'page').join('\n')}
</body>
</html>`;
}

/**
 * Kartenseiten ohne Dokumenthülle, für ein fremdes Stylesheet: der Charakterbogen hängt sie
 * an und benennt das Raster selbst, weil sein `.page` etwas anderes ist.
 */
export const embeddedCardPages = (shells: CardShell[], doc: Document, pageClass: string): string =>
  cardPages(measuredCards(shells, doc), pageClass).join('\n');
