/**
 * Beschreibungstexte des Monster Manual 2024 aus gespeicherten D&D-Beyond-Seiten → je Familie
 * ein Markdown-Text samt den Einleitungen ihrer Statblöcke. Die Statblöcke selbst liest `statBlocks.ts`.
 */
import { decode, plain, statBlockHtml } from './statBlocks';

export interface LoreFamily {
  name: string;
  tagline: string;
  habitat: string;
  treasure: string;
  intro: string;
  monsters: { statBlock: string; intro: string }[];
}

/** Fließtext mit Hervorhebungen; Links (Zauber, Zustände, Querverweise) bleiben reiner Text. */
export function inlineMd(html: string): string {
  return decode(
    html
      .replace(/<br\s*\/?>/g, ' ')
      .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/g, (_, __, t: string) => (t.trim() ? `**${t.trim()}**` : ''))
      .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/g, (_, __, t: string) => (t.trim() ? `*${t.trim()}*` : ''))
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

const cells = (row: string): string[] =>
  [...row.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/g)].map((m) => inlineMd(m[1]).replace(/\|/g, '\\|'));

function tableMd(html: string): string {
  const caption = html.match(/<caption\b[^>]*>([\s\S]*?)<\/caption>/)?.[1];
  const body = html.replace(/<caption[\s\S]*?<\/caption>/, '');
  const rows = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => cells(m[1]));
  if (!rows.length) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const line = (r: string[]) => `| ${[...r, ...Array<string>(width - r.length).fill('')].join(' | ')} |`;
  const table = [line(rows[0]), line(Array<string>(width).fill('---')), ...rows.slice(1).map(line)].join('\n');
  return caption ? `**${inlineMd(caption).replace(/\*/g, '')}**\n\n${table}` : table;
}

const listMd = (html: string, ordered: boolean): string =>
  [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)]
    .map((m, i) => `${ordered ? `${i + 1}.` : '-'} ${inlineMd(m[1])}`)
    .join('\n');

const asideMd = (html: string): string =>
  [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map((m) => `> ${inlineMd(m[1])}`).join('\n>\n');

type Token =
  | { kind: 'h2' | 'h3' | 'h4'; text: string }
  | { kind: 'p'; text: string; cls: string }
  | { kind: 'md'; text: string }
  | { kind: 'stat'; name: string };

const BLOCK = /\[\[STAT:([^\]]*)\]\]|<(h[1-6]|p|table|aside|ul|ol)\b([^>]*)>([\s\S]*?)<\/\2>/g;

/** Der Artikelinhalt als flache Folge von Blöcken; Bilder und Layout-Divs fallen weg. */
export function loreTokens(page: string): Token[] {
  const start = page.indexOf('<div class="p-article-content');
  const end = page.indexOf('<footer class="p-article-footer"', start);
  let body = page.slice(Math.max(start, 0), end === -1 ? undefined : end);
  for (const block of statBlockHtml(body)) {
    const name = plain(block.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/)?.[1] ?? '');
    body = body.replace(block, `[[STAT:${name}]]`);
  }
  body = body.replace(/<figure\b[\s\S]*?<\/figure>/g, '');
  const tokens: Token[] = [];
  for (const m of body.matchAll(BLOCK)) {
    const [, stat, tag, attrs, inner] = m;
    if (stat !== undefined) tokens.push({ kind: 'stat', name: stat });
    // Nur ein `h2` mit Monster-Metadaten eröffnet eine Familie; der Xorn trägt ein zweites als Statblock-Titel.
    else if (tag === 'h2' || tag === 'h3' || tag === 'h4') {
      const kind = tag === 'h2' && !attrs.includes('monster-with-metadata') ? 'h3' : tag;
      tokens.push({ kind, text: inlineMd(inner).replace(/\*/g, '') });
    }
    else if (tag === 'p') tokens.push({ kind: 'p', text: inlineMd(inner), cls: attrs.match(/class="([^"]*)"/)?.[1] ?? '' });
    else if (tag === 'table') tokens.push({ kind: 'md', text: tableMd(m[0]) });
    else if (tag === 'aside') tokens.push({ kind: 'md', text: asideMd(inner) });
    else if (tag === 'ul' || tag === 'ol') tokens.push({ kind: 'md', text: listMd(inner, tag === 'ol') });
  }
  return tokens.filter((t) => !('text' in t) || t.text !== '');
}

function habitatTreasure(text: string): { habitat: string; treasure: string } {
  const field = (label: string) =>
    text.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*([^;]*?)\\s*(?:;|$)`))?.[1].trim() ?? '';
  return { habitat: field('Habitat'), treasure: field('Treasure') };
}

/** Ein `h3`, dem bis zum nächsten Abschnitt ein Statblock folgt, betitelt diesen — sonst ist es ein Unterabschnitt. */
function headsStatBlock(tokens: Token[], at: number): boolean {
  for (const t of tokens.slice(at + 1)) {
    if (t.kind === 'stat') return true;
    if (t.kind !== 'p') return false;
  }
  return false;
}

export function loreFamilies(page: string): LoreFamily[] {
  const tokens = loreTokens(page);
  const families: LoreFamily[] = [];
  let family: LoreFamily | null = null;
  let parts: string[] = [];
  let ownIntro: string[] | null = null;
  const flush = () => {
    if (family) family.intro = parts.join('\n\n');
    parts = [];
  };
  tokens.forEach((t, i) => {
    if (t.kind === 'h2') {
      flush();
      family = { name: t.text, tagline: '', habitat: '', treasure: '', intro: '', monsters: [] };
      families.push(family);
      ownIntro = null;
      return;
    }
    if (!family) return;
    if (t.kind === 'p' && t.cls.includes('treasure-habitat')) Object.assign(family, habitatTreasure(t.text));
    else if (t.kind === 'p' && tokens[i - 1].kind === 'h2' && !/[.!?:]$/.test(t.text)) family.tagline = t.text;
    else if (t.kind === 'h3' && headsStatBlock(tokens, i)) ownIntro = [];
    else if (t.kind === 'stat') {
      family.monsters.push({ statBlock: t.name, intro: (ownIntro ?? []).join('\n\n') });
      ownIntro = null;
    } else if (t.kind === 'p' && ownIntro) ownIntro.push(t.text);
    else if (t.kind === 'h3' || t.kind === 'h4') parts.push(`${t.kind === 'h3' ? '###' : '####'} ${t.text}`);
    else if (t.kind === 'p' || t.kind === 'md') parts.push(t.text);
  });
  flush();
  return families;
}
