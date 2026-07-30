/**
 * Regeltext → HTML. Die eine Stelle, an der Markdown zu Markup wird.
 *
 * Bildschirm (`components/Markdown.svelte`) und Druck-HTML (`utils/print*.ts`)
 * teilen sich diese Funktionen und `components/ruleText.css` — sonst driften
 * Karte und PDF auseinander, wie es vorher pro Entität passiert ist.
 *
 * Sicherheit: marked escaped rohes HTML im Quelltext NICHT, und das Ergebnis
 * landet über `{@html}` im DOM. Bewusst kein Sanitizer: Regeltext kommt aus dem
 * lokalen Vault des Users und aus LLM-Antworten, die er selbst auslöst — beides
 * eigener Inhalt, kein fremder Input. Sobald Vault-Inhalt aus fremder Quelle
 * importiert werden kann, gehört hierher ein Filter.
 */
import { Marked, type Token } from 'marked';

/**
 * Eigene Instanz statt Optionen pro Aufruf: `marked.lexer(src, opts)` **ersetzt**
 * die Defaults, statt sie zu mergen — damit fiele `gfm` weg und jede Tabelle der
 * Gegenstands-Bibliothek würde als Absatz voller Pipe-Zeichen gerendert.
 *
 * `breaks: true` — ein einzelner Zeilenumbruch bleibt ein Umbruch, wie beim
 * vorherigen `white-space: pre-wrap`. Ohne das verschmelzen die Blockquote-
 * Statblocks der Gegenstands-Bibliothek („> **RK** 11" je Zeile) zu einer Zeile,
 * und die im Textfeld getippten Encounter-Texte verlieren ihre Absätze.
 */
const md = new Marked({ async: false, breaks: true });

/**
 * Fügt Regeltext zu einem Markdown-Dokument zusammen. Die Vault-Schemas führen
 * Beschreibungen teils als Block-Array (`item.desc_de`), teils als einen String
 * (`feat.descDe`).
 */
export function ruleText(parts: string[] | string | undefined | null): string {
  if (!parts) return '';
  return Array.isArray(parts) ? parts.filter(Boolean).join('\n\n') : parts;
}

/** Block-Markdown → HTML (Absätze, Tabellen, Listen). */
export function renderMarkdown(source: string | undefined | null): string {
  return md.parse(source ?? '') as string;
}

/**
 * Inline-Markdown → HTML, ohne umgebendes `<p>`. Für Stellen, an denen der Text
 * in einer laufenden Zeile weitergeht (Statblock-Aktionen: „**Name.** Text"),
 * wo ein Block-Element die Zeile umbrechen würde.
 */
export function renderMarkdownInline(source: string | undefined | null): string {
  return md.parseInline(source ?? '') as string;
}

/** Ein Top-Level-Block des Quelltexts, samt gerendertem HTML. */
export type MarkdownBlock = {
  token: Token;
  html: string;
  /** Rohtext des Blocks — Rückfallebene, wenn ein Block allein zu groß ist. */
  raw: string;
};

/**
 * Zerlegt Regeltext in seine Top-Level-Blöcke. Grundlage der Zauber-Pagination:
 * ein Block ist die kleinste Einheit, die nicht zerrissen werden darf.
 */
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
