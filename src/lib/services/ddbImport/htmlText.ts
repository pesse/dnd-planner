/** D&D-Beyond-HTML → Absätze im Klartext. Regex statt DOMParser: läuft auch im Test ohne DOM. */
const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…', times: '×', minus: '−',
};

function decode(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Absätze, Listenpunkte als „- ", Tabellenzellen mit „ | " getrennt. */
export function htmlParagraphs(html: string | null | undefined): string[] {
  if (!html) return [];
  const text = html
    .replace(/\r/g, '')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/t[dh]>\s*<t[dh][^>]*>/gi, ' | ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|table|ul|ol)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '');
  return decode(text)
    .split(/\n{2,}/)
    .map((p) => p.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n'))
    .filter(Boolean);
}

export const htmlText = (html: string | null | undefined): string => htmlParagraphs(html).join('\n\n');
