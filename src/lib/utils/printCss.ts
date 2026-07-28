/**
 * Regeltext-Styles für die Druck-Iframes.
 *
 * Die Druck-Dokumente sind eigenständige HTML-Seiten und sehen die Theme-Tokens
 * aus app.css nicht. Deshalb wird `ruleText.css` unverändert über `?inline` als
 * Text geholt (erster Einsatz dieses Vite-Imports im Projekt) und ihm ein Block
 * mit Papierwerten vorangestellt — so bleibt eine Quelle für Karte und PDF.
 */
import ruleTextCss from '../components/ruleText.css?inline';

// Auf `.md` gesetzt, nicht auf :root — die Druck-Seiten haben eigene Paletten.
const RULE_TEXT_PAPER_VARS = `
.md {
  --surface:   #f3e9d0;
  --border:    #b3a47d;
  --arcane:    #6d3b8e;
  --ink-soft:  #5a4a30;
}
`;

export const RULE_TEXT_PRINT_CSS = `${RULE_TEXT_PAPER_VARS}${ruleTextCss}`;
