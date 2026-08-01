/**
 * Rendert Markdown als zusätzliche PDF-Seiten (pdf-lib) — der Freitext hinter dem
 * ausgefüllten Charakterbogen. Was der Renderer unten nicht kennt (Tabellen, Bilder),
 * landet als Klartext auf der Seite statt zu fehlen.
 */
import { PDFDocument, PDFFont, StandardFonts, rgb, type RGB } from 'pdf-lib';
import { marked, type Token, type Tokens } from 'marked';

// A4 Hochformat in PostScript-Punkten
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;

const INK = rgb(0.13, 0.12, 0.1);
const INK_SOFT = rgb(0.38, 0.36, 0.32);
const H1_COLOR = rgb(0.45, 0.16, 0.13);
const H2_COLOR = rgb(0.55, 0.2, 0.15);
const H3_COLOR = rgb(0.2, 0.32, 0.36);
const CODE_COLOR = rgb(0.15, 0.35, 0.2);
const QUOTE_BAR = rgb(0.7, 0.66, 0.58);

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
  mono: PDFFont;
}

interface Cursor {
  pdf: PDFDocument;
  page: ReturnType<PDFDocument['addPage']>;
  y: number;
  fonts: Fonts;
}

interface Run {
  text: string;
  font: PDFFont;
  size: number;
  color: RGB;
}

function newPage(cur: Cursor) {
  cur.page = cur.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  cur.y = PAGE_HEIGHT - MARGIN;
}

function ensureSpace(cur: Cursor, needed: number) {
  if (cur.y - needed < MARGIN) newPage(cur);
}

function pickFont(fonts: Fonts, bold: boolean, italic: boolean, code: boolean): PDFFont {
  if (code) return fonts.mono;
  if (bold && italic) return fonts.boldItalic;
  if (bold) return fonts.bold;
  if (italic) return fonts.italic;
  return fonts.regular;
}

function inlineRuns(
  tokens: Token[] | undefined,
  fonts: Fonts,
  size: number,
  color: RGB,
  bold = false,
  italic = false,
): Run[] {
  if (!tokens) return [];
  const runs: Run[] = [];
  for (const tk of tokens as Tokens.Generic[]) {
    switch (tk.type) {
      case 'strong':
        runs.push(...inlineRuns(tk.tokens, fonts, size, color, true, italic));
        break;
      case 'em':
        runs.push(...inlineRuns(tk.tokens, fonts, size, color, bold, true));
        break;
      case 'del':
        // Durchgestrichen kann pdf-lib nicht direkt — als Klartext mit ~ markieren
        runs.push(...inlineRuns(tk.tokens, fonts, size, INK_SOFT, bold, italic));
        break;
      case 'codespan':
        runs.push({ text: sanitize(tk.text), font: fonts.mono, size, color: CODE_COLOR });
        break;
      case 'link':
        runs.push(...inlineRuns(tk.tokens, fonts, size, color, bold, italic));
        break;
      case 'br':
        runs.push({ text: '\n', font: pickFont(fonts, bold, italic, false), size, color });
        break;
      case 'text':
        if (tk.tokens) {
          runs.push(...inlineRuns(tk.tokens, fonts, size, color, bold, italic));
        } else {
          runs.push({ text: sanitize(tk.text), font: pickFont(fonts, bold, italic, false), size, color });
        }
        break;
      default:
        if (typeof tk.text === 'string') {
          runs.push({ text: sanitize(tk.text), font: pickFont(fonts, bold, italic, false), size, color });
        }
    }
  }
  return runs;
}

/** WinAnsi deckt nicht ganz Unicode ab — ohne Ersatz wirft das Encoding beim Zeichnen. */
function sanitize(s: string): string {
  return (s ?? '')
    .replace(/[‘’‚‹›]/g, "'")
    .replace(/[“”„«»]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/[•]/g, '-')
    .replace(/[^\n\t\x20-\xFF]/g, '');
}

function drawRuns(cur: Cursor, runs: Run[], x: number, lineHeight: number) {
  const maxWidth = PAGE_WIDTH - MARGIN - x;
  // Umbruch je Wort statt je Run — der Style muss dabei am Wort hängen bleiben.
  type Word = { text: string; font: PDFFont; size: number; color: RGB; hardBreak?: boolean };
  const words: Word[] = [];
  for (const run of runs) {
    const segments = run.text.split('\n');
    segments.forEach((seg, i) => {
      if (i > 0) words.push({ text: '', font: run.font, size: run.size, color: run.color, hardBreak: true });
      for (const w of seg.split(/(\s+)/)) {
        if (w === '') continue;
        if (/^\s+$/.test(w)) continue; // Leerraum → über Wortabstand abgebildet
        words.push({ text: w, font: run.font, size: run.size, color: run.color });
      }
    });
  }

  let line: Word[] = [];
  let lineWidth = 0;
  const spaceWidthFor = (w: Word) => w.font.widthOfTextAtSize(' ', w.size);

  const flush = () => {
    const lh = line.length
      ? Math.max(...line.map(w => w.size)) * 1.35
      : lineHeight;
    ensureSpace(cur, lh);
    cur.y -= lh;
    let penX = x;
    for (let i = 0; i < line.length; i++) {
      const w = line[i];
      if (i > 0) penX += spaceWidthFor(w);
      cur.page.drawText(w.text, { x: penX, y: cur.y, size: w.size, font: w.font, color: w.color });
      penX += w.font.widthOfTextAtSize(w.text, w.size);
    }
    line = [];
    lineWidth = 0;
  };

  for (const w of words) {
    if (w.hardBreak) { flush(); continue; }
    const ww = w.font.widthOfTextAtSize(w.text, w.size);
    const addWidth = (line.length ? spaceWidthFor(w) : 0) + ww;
    if (line.length && lineWidth + addWidth > maxWidth) flush();
    line.push(w);
    lineWidth += (line.length > 1 ? spaceWidthFor(w) : 0) + ww;
  }
  flush();
}

function drawHeading(cur: Cursor, token: Tokens.Heading) {
  const sizes = [22, 17, 14, 12, 11, 10];
  const colors = [H1_COLOR, H2_COLOR, H3_COLOR, H3_COLOR, H3_COLOR, H3_COLOR];
  const size = sizes[token.depth - 1] ?? 11;
  const color = colors[token.depth - 1] ?? H3_COLOR;
  cur.y -= token.depth <= 2 ? 12 : 7; // Abstand davor
  const runs = inlineRuns(token.tokens, cur.fonts, size, color, true, false);
  drawRuns(cur, runs, MARGIN, size * 1.35);
  cur.y -= 3;
}

function drawParagraph(cur: Cursor, token: Tokens.Paragraph) {
  const runs = inlineRuns(token.tokens, cur.fonts, 10.5, INK);
  drawRuns(cur, runs, MARGIN, 10.5 * 1.5);
  cur.y -= 6;
}

function drawList(cur: Cursor, token: Tokens.List, depth = 0) {
  const indent = MARGIN + 14 + depth * 16;
  let n = typeof token.start === 'number' ? token.start : 1;
  for (const item of token.items) {
    const marker = token.ordered ? `${n}.` : '-';
    n++;
    const lh = 10.5 * 1.5;
    // Erst die Item-Tokens sammeln: der Marker muss auf der ERSTEN Zeile sitzen, seine
    // y-Position steht also erst fest, wenn der Umbruch des Textes bekannt ist.
    const inlineTokens: Token[] = [];
    const subLists: Tokens.List[] = [];
    for (const sub of item.tokens) {
      if (sub.type === 'list') subLists.push(sub as Tokens.List);
      else if (sub.type === 'text') inlineTokens.push(...((sub as Tokens.Text).tokens ?? [{ type: 'text', text: (sub as Tokens.Text).text } as unknown as Token]));
      else if (sub.type === 'paragraph') inlineTokens.push(...((sub as Tokens.Paragraph).tokens ?? []));
    }
    ensureSpace(cur, lh);
    const markerY = cur.y - lh;
    cur.page.drawText(marker, { x: indent - 12, y: markerY, size: 10.5, font: cur.fonts.regular, color: INK_SOFT });
    const runs = inlineRuns(inlineTokens, cur.fonts, 10.5, INK);
    drawRuns(cur, runs, indent, lh);
    for (const sl of subLists) drawList(cur, sl, depth + 1);
    cur.y -= 2;
  }
  cur.y -= 4;
}

function drawBlockquote(cur: Cursor, token: Tokens.Blockquote) {
  const startY = cur.y;
  const indent = MARGIN + 14;
  for (const sub of token.tokens) {
    if (sub.type === 'paragraph') {
      const runs = inlineRuns((sub as Tokens.Paragraph).tokens, cur.fonts, 10.5, INK_SOFT, false, true);
      drawRuns(cur, runs, indent, 10.5 * 1.5);
      cur.y -= 4;
    }
  }
  cur.page.drawRectangle({
    x: MARGIN + 2,
    y: cur.y,
    width: 2.5,
    height: Math.max(0, startY - cur.y),
    color: QUOTE_BAR,
  });
  cur.y -= 4;
}

function drawCodeBlock(cur: Cursor, token: Tokens.Code) {
  const size = 9;
  const lh = size * 1.45;
  for (const rawLine of sanitize(token.text).split('\n')) {
    ensureSpace(cur, lh);
    cur.y -= lh;
    cur.page.drawText(rawLine, { x: MARGIN + 6, y: cur.y, size, font: cur.fonts.mono, color: CODE_COLOR });
  }
  cur.y -= 6;
}

function drawHr(cur: Cursor) {
  ensureSpace(cur, 14);
  cur.y -= 8;
  cur.page.drawLine({
    start: { x: MARGIN, y: cur.y },
    end: { x: PAGE_WIDTH - MARGIN, y: cur.y },
    thickness: 0.75,
    color: QUOTE_BAR,
  });
  cur.y -= 8;
}

/** Mutiert `pdf`: hängt die Seiten an, `title` wird zur H1 der ersten neuen Seite. */
export async function appendMarkdownPages(
  pdf: PDFDocument,
  markdown: string,
  options: { title?: string } = {},
): Promise<void> {
  const trimmed = (markdown ?? '').trim();
  if (!trimmed) return;

  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
    mono: await pdf.embedFont(StandardFonts.Courier),
  };

  const cur: Cursor = {
    pdf,
    page: pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: PAGE_HEIGHT - MARGIN,
    fonts,
  };

  if (options.title) {
    const size = 22;
    const text = sanitize(options.title);
    cur.y -= size * 1.35;
    cur.page.drawText(text, { x: MARGIN, y: cur.y, size, font: fonts.bold, color: H1_COLOR });
    cur.y -= 6;
    cur.page.drawLine({
      start: { x: MARGIN, y: cur.y },
      end: { x: PAGE_WIDTH - MARGIN, y: cur.y },
      thickness: 1,
      color: H1_COLOR,
    });
    cur.y -= 14;
  }

  const tokens = marked.lexer(trimmed);
  for (const token of tokens) {
    switch (token.type) {
      case 'heading':    drawHeading(cur, token as Tokens.Heading); break;
      case 'paragraph':  drawParagraph(cur, token as Tokens.Paragraph); break;
      case 'list':       drawList(cur, token as Tokens.List); break;
      case 'blockquote': drawBlockquote(cur, token as Tokens.Blockquote); break;
      case 'code':       drawCodeBlock(cur, token as Tokens.Code); break;
      case 'hr':         drawHr(cur); break;
      case 'space':      cur.y -= 6; break;
      default: {
        const t = token as Tokens.Generic;
        if (typeof t.text === 'string' && t.text.trim()) {
          drawRuns(cur, inlineRuns([t as Token], fonts, 10.5, INK), MARGIN, 10.5 * 1.5);
          cur.y -= 6;
        }
      }
    }
  }
}
