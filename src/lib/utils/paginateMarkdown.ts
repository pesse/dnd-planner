/**
 * Blockweise Seitenaufteilung von Regeltext (Zauberkarten). Ein Top-Level-Block ist die
 * kleinste Einheit — an beliebiger Stelle geschnittenes Markdown rendert als Müll. Gemessen
 * wird am Browser statt geschätzt: `fits` bekommt fertiges HTML (siehe `createHtmlFitter`).
 */
import type { Tokens } from 'marked';
import { markdownBlocks, renderMarkdown, type MarkdownBlock } from './markdown';

/** Höhe in px. */
export type FitsFn = (html: string, height: number) => boolean;

export interface PaginateOptions {
  /** Höhe je Seitenindex in px — die erste Karte ist kleiner als die Folgekarten. */
  heightOf: (pageIndex: number) => number;
  fits: FitsFn;
  /** HTML, das auf der letzten Seite zusätzlich Platz braucht (z.B. „Auf höheren Graden."). */
  tailHtml?: string;
}

/** Binärsuche, weil jede Messung ein Reflow ist; 0, wenn schon eine Einheit zu groß ist. */
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
    // Netz gegen die Endlosschleife: die Seite läuft dann über und wird im Druck von
    // `overflow: hidden` beschnitten. Über die ganze Bibliothek tritt der Fall nie ein.
    if (take === 0) take = 1;
    out.push(toHtml(rest.slice(0, take)));
    rest = rest.slice(take);
    page++;
  }

  return out;
}

const rawLines = (block: MarkdownBlock): string[] =>
  block.raw.split('\n').filter((l) => l.trim().length > 0);

/** Geteilt wird immer am Rohtext und neu gerendert — nie am fertigen HTML. */
function splitBlock(
  block: MarkdownBlock,
  fits: FitsFn,
  heightOf: (pageIndex: number) => number,
  firstPageIndex: number,
): string[] {
  const render = (md: string) => renderMarkdown(md);

  if (block.token.type === 'table') {
    // Kopf + Trennzeile wiederholen sich, sonst verliert die Folgeseite die Spaltenbedeutung.
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

  // Zeilengebundene Blöcke (Zitat, Codeblock) nur an Zeilengrenzen — Präfixe wie „> " bleiben.
  const lines = rawLines(block);
  if (lines.length > 1 && lines.every((l) => /^\s*[>|]/.test(l))) {
    return chunkUnits(lines, (slice) => render(slice.join('\n')), fits, heightOf, firstPageIndex);
  }

  // Absatz & Rest an Wortgrenzen: ein Absatz bleibt an jeder Wortgrenze gültiges Markdown.
  const words = block.raw.trim().split(/\s+/);
  return chunkUnits(words, (slice) => render(slice.join(' ')), fits, heightOf, firstPageIndex);
}

/** Je Seite ein HTML-String — bereits gerendert, nicht erneut durch den Renderer schicken. */
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

  // Passt der Schluss-Zusatz nicht mehr auf die letzte Karte, bekommt er eine eigene.
  if (tailHtml) {
    const lastIdx = pages.length - 1;
    if (!fits(pages[lastIdx] + tailHtml, heightOf(lastIdx))) pages.push('');
  }

  return pages;
}

export interface HtmlFitterOptions {
  doc: Document;
  /** Inkl. Padding (border-box), z.B. "69mm". */
  width: string;
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  padding: string;
}

/**
 * Unsichtbares Mess-Element in der Geometrie des Zielbereichs. Die Klasse `md` muss dran
 * bleiben: ohne die Blockabstände aus `ruleText.css` misst der Fitter zu wenig.
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
