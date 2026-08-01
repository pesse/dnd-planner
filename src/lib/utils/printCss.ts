/**
 * Regeltext-Styles für die Druck-Iframes. Die Druck-Dokumente sind eigene HTML-Seiten und
 * sehen die Theme-Tokens aus app.css nicht; `ruleText.css` kommt deshalb per `?inline` als
 * Text herein, mit Papierwerten davor — eine Quelle für Karte und PDF.
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
