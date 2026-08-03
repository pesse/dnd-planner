/**
 * Regeltext → HTML. Die eine Stelle, an der Markdown zu Markup wird; Bildschirm
 * (`components/Markdown.svelte`) und Druck-HTML (`utils/print*.ts`) teilen sie sich
 * samt `components/ruleText.css`, sonst driften Karte und PDF auseinander.
 */
import { Marked, type Token } from 'marked';

// Kein Sanitizer, obwohl das Ergebnis per `{@html}` ins DOM geht: Regeltext kommt aus
// dem lokalen Vault und aus selbst ausgelösten LLM-Antworten. Sobald Vault-Inhalt aus
// fremder Quelle importiert werden kann, gehört hierher ein Filter.
//
// Eigene Instanz statt Optionen pro Aufruf: `marked.lexer(src, opts)` ERSETZT die
// Defaults — ohne `gfm` wird jede Tabelle zum Pipe-Absatz. `breaks: true` hält den
// einzelnen Umbruch, sonst verschmelzen die Blockquote-Statblocks zu einer Zeile.
const md = new Marked({ async: false, breaks: true });

export function ruleText(parts: string[] | string | undefined | null): string {
  if (!parts) return '';
  return Array.isArray(parts) ? parts.filter(Boolean).join('\n\n') : parts;
}

export function renderMarkdown(source: string | undefined | null): string {
  return md.parse(source ?? '') as string;
}

/** Ohne umgebendes `<p>` — für Text, der in einer laufenden Zeile weitergeht. */
export function renderMarkdownInline(source: string | undefined | null): string {
  return md.parseInline(source ?? '') as string;
}

export type MarkdownBlock = {
  token: Token;
  html: string;
  /** Rohtext des Blocks — Rückfallebene, wenn ein Block allein zu groß ist. */
  raw: string;
};

/** Ein Block ist die kleinste Einheit, die die Pagination nicht zerreißen darf. */
export function markdownBlocks(source: string | undefined | null): MarkdownBlock[] {
  const tokens = md.lexer(source ?? '');
  return tokens
    .filter((t) => t.type !== 'space')
    .map((token) => ({
      token,
      html: md.parser([token]) as string,
      raw: token.raw,
    }));
}
