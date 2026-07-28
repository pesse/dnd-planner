/**
 * Blockweise Seitenaufteilung von Regeltext — Grundlage der Zauberkarten.
 *
 * Vorher wurde der Klartext an Zeichenpositionen geschnitten. Mit Markdown geht
 * das nicht: eine an beliebiger Stelle geteilte Tabelle rendert auf beiden Karten
 * als Müll. Ein Top-Level-Block ist deshalb die kleinste Einheit; nur ein Block,
 * der allein auf keine Seite passt, wird geteilt — Tabellen zeilenweise mit
 * wiederholtem Kopf, Listen elementweise, Absätze an Wortgrenzen.
 *
 * Gemessen wird nicht geschätzt: `fits` bekommt fertiges HTML und befragt den
 * Browser (siehe `createHtmlFitter`).
 */
import type { Tokens } from 'marked';
import { markdownBlocks, renderMarkdown, type MarkdownBlock } from './markdown';

/** Passt dieses HTML in einen Bereich der Höhe `height` (px)? */
export type FitsFn = (html: string, height: number) => boolean;

export interface PaginateOptions {
  /** Höhe der Seite mit diesem Index in px (erste Karte ist kleiner als die Folgekarten). */
  heightOf: (pageIndex: number) => number;
  fits: FitsFn;
  /** HTML, das auf der letzten Seite zusätzlich Platz braucht (z.B. „Auf höheren Graden."). */
  tailHtml?: string;
}

/**
 * Größter Präfix von `units`, der als HTML noch passt — Binärsuche, weil jede
 * Messung ein Reflow ist. Gibt 0 zurück, wenn schon eine Einheit zu groß ist.
 */
function longestFittingPrefix(
  units: string[],
  toHtml: (count: number) => string,
  fits: FitsFn,
  height: number,
): number {
  if (!units.length) return 0;
  if (fits(toHtml(units.length), height)) return units.length;

  let lo = 0;
  let hi = units.length;
  while (lo < hi - 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(toHtml(mid), height)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Zerlegt `units` in Gruppen, die je auf eine Seite passen. */
function chunkUnits(
  units: string[],
  toHtml: (slice: string[]) => string,
  fits: FitsFn,
  heightOf: (pageIndex: number) => number,
  firstPageIndex: number,
): string[] {
  const out: string[] = [];
  let rest = units;
  let page = firstPageIndex;

  while (rest.length) {
    const height = heightOf(page);
    let take = longestFittingPrefix(rest, (n) => toHtml(rest.slice(0, n)), fits, height);
    // Nichts passt: eine Einheit erzwingen, sonst läuft die Schleife endlos.
    // Diese Seite läuft dann über und wird im Druck von `overflow: hidden`
    // beschnitten — bei echter Kartengeometrie tritt der Fall nicht auf (geprüft
    // über die gesamte Bibliothek), er ist nur das Netz gegen Endlosschleifen.
    if (take === 0) take = 1;
    out.push(toHtml(rest.slice(0, take)));
    rest = rest.slice(take);
    page++;
  }

  return out;
}

/** Zeilen des Rohblocks ohne Leerzeilen. */
const rawLines = (block: MarkdownBlock): string[] =>
  block.raw.split('\n').filter((l) => l.trim().length > 0);

/**
 * Teilt einen Block, der allein keine Seite füllt, in mehrere HTML-Stücke.
 * Geteilt wird immer am Rohtext und neu gerendert — nie am fertigen HTML.
 */
function splitBlock(
  block: MarkdownBlock,
  fits: FitsFn,
  heightOf: (pageIndex: number) => number,
  firstPageIndex: number,
): string[] {
  const render = (md: string) => renderMarkdown(md);

  if (block.token.type === 'table') {
    // Kopf + Trennzeile stehen auf jeder Folgeseite erneut, sonst verliert die
    // zweite Hälfte ihre Spaltenbedeutung (und wäre gar keine Tabelle mehr).
    const lines = rawLines(block);
    const head = lines.slice(0, 2);
    const rows = lines.slice(2);
    if (rows.length > 1) {
      return chunkUnits(rows, (slice) => render([...head, ...slice].join('\n')), fits, heightOf, firstPageIndex);
    }
  }

  if (block.token.type === 'list') {
    const items = (block.token as Tokens.List).items ?? [];
    if (items.length > 1) {
      return chunkUnits(
        items.map((it) => it.raw.trimEnd()),
        (slice) => render(slice.join('\n')),
        fits,
        heightOf,
        firstPageIndex,
      );
    }
  }

  // Zeilengebundene Blöcke (Zitat, Codeblock): an Zeilengrenzen teilen, damit
  // Präfixe wie „> " erhalten bleiben.
  const lines = rawLines(block);
  if (lines.length > 1 && lines.every((l) => /^\s*[>|]/.test(l))) {
    return chunkUnits(lines, (slice) => render(slice.join('\n')), fits, heightOf, firstPageIndex);
  }

  // Absatz & Rest: an Wortgrenzen. Der Block bleibt gültiges Markdown, weil ein
  // Absatz an jeder Wortgrenze wieder ein Absatz ist.
  const words = block.raw.trim().split(/\s+/);
  return chunkUnits(words, (slice) => render(slice.join(' ')), fits, heightOf, firstPageIndex);
}

/**
 * Verteilt Regeltext auf Seiten. Rückgabe: je Seite ein HTML-String (bereits
 * gerendert — nicht erneut durch einen Markdown-Renderer schicken).
 */
export function paginateMarkdown(source: string, opts: PaginateOptions): string[] {
  const { heightOf, fits, tailHtml = '' } = opts;
  const blocks = markdownBlocks(source);
  if (!blocks.length) return [''];

  const pages: string[] = [];
  let current = '';

  const push = () => {
    pages.push(current);
    current = '';
  };

  for (const block of blocks) {
    if (fits(current + block.html, heightOf(pages.length))) {
      current += block.html;
      continue;
    }

    if (current) push();

    if (fits(block.html, heightOf(pages.length))) {
      current = block.html;
      continue;
    }

    const parts = splitBlock(block, fits, heightOf, pages.length);
    current = parts.pop() ?? '';
    pages.push(...parts);
  }

  if (current || !pages.length) push();

  // Der Schluss-Zusatz („Auf höheren Graden.") darf die letzte Karte nicht
  // überlaufen lassen — sonst bekommt er eine eigene.
  if (tailHtml) {
    const lastIdx = pages.length - 1;
    if (!fits(pages[lastIdx] + tailHtml, heightOf(lastIdx))) pages.push('');
  }

  return pages;
}

export interface HtmlFitterOptions {
  doc: Document;
  /** Breite des Textbereichs inkl. Padding (border-box), z.B. "69mm" oder "346px". */
  width: string;
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  padding: string;
}

/**
 * Unsichtbares Mess-Element, das die Geometrie des Ziel-Bereichs nachbildet.
 * Trägt die Klasse `md`, damit die Blockabstände aus `ruleText.css` mitgemessen
 * werden — ohne das misst der Fitter zu wenig und der Text läuft im Druck über.
 */
export function createHtmlFitter(o: HtmlFitterOptions): { fits: FitsFn; destroy: () => void } {
  const el = o.doc.createElement('div');
  el.className = 'md';
  el.style.cssText = [
    'position:fixed', 'top:-9999px', 'left:-9999px',
    `font-family:${o.fontFamily}`,
    `font-size:${o.fontSize}`,
    `line-height:${o.lineHeight}`,
    'word-break:break-word',
    'overflow:hidden',
    'box-sizing:border-box',
    `width:${o.width}`,
    `padding:${o.padding}`,
  ].join(';');
  o.doc.body.appendChild(el);

  return {
    fits(html: string, height: number): boolean {
      if (!html) return true;
      el.style.height = `${height}px`;
      el.innerHTML = html;
      return el.scrollHeight <= el.clientHeight + 2;
    },
    destroy() {
      el.remove();
    },
  };
}
