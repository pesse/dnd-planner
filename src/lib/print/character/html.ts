/**
 * Die Bausteine des Bogens: Kästchen, Kreise, beschriftete Felder, Blockrahmen.
 * Alles reine Strings — die Renderer bleiben ohne DOM und damit testbar.
 */

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Eine Zeile wie „[Eigenschaften]" gliedert den Freitext, sie ist kein Inhalt. */
const HEADING_LINE = /^\s*\[([^\]\n]*)\]\s*$/;

/**
 * Mehrzeiliger Freitext als Absätze: nur so kann `break-inside: avoid` einen Merkmalstext
 * zusammenhalten, statt ihn irgendwo zwischen Überschrift und Rumpf über die Spalte zu reißen.
 * Aus dem Editor kommt CRLF — ohne die Normalisierung bleibt der ganze Text ein Absatz und
 * fällt als Ganzes in die erste Spalte. Die führende Gliederungszeile wiederholt nur die
 * Kastenüberschrift.
 */
export const escLines = (s: string): string => {
  const lines = s.replace(/\r\n?/g, '\n').split('\n');
  if (HEADING_LINE.test(lines[0] ?? '')) lines.shift();
  const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) return '';
  return text.split('\n\n').map((para) => {
    const inner = para.split('\n').map((line) => {
      const heading = HEADING_LINE.exec(line);
      return heading ? `<b class="phead">${esc(heading[1])}</b>` : esc(line);
    }).join('<br>');
    return `<p>${inner}</p>`;
  }).join('');
};

/** Leere Zeilen zum Eintragen — was am Tisch gewählt wird, braucht Platz, kein Kästchen. */
export const writeLines = (n: number): string =>
  Array.from({ length: Math.max(0, n) }, () => '<div class="wline"></div>').join('');

/** Leere Kästchen zum Abstreichen — für Vorräte, die die App nicht mitzählt. */
export const tickBoxes = (n: number): string =>
  `<span class="ticks">${'<i class="tick"></i>'.repeat(Math.max(0, n))}</span>`;

/** Zauberplätze: gefüllt = verbraucht, damit ein gespeicherter Stand mitgedruckt wird. */
export const slotCircles = (total: number, used = 0): string =>
  `<span class="slots">${Array.from({ length: Math.max(0, total) }, (_, i) =>
    `<i class="slot${i < used ? ' spent' : ''}"></i>`).join('')}</span>`;

/** Verbundene Kreise wie bei den Rettungswürfen gegen Tod: ○–○–○, eine Reihe, kein Trio. */
export const chainCircles = (n: number): string =>
  `<span class="chain">${Array.from({ length: Math.max(0, n) }, () => '<i class="slot"></i>')
    .join('<i class="link"></i>')}</span>`;

export const checkbox = (checked: boolean): string =>
  `<i class="cbox${checked ? ' on' : ''}"></i>`;

/** Beschriftetes Wertfeld: kleine Kapitälchen-Beschriftung über dem Wert. */
export const field = (label: string, value: string, cls = ''): string =>
  `<div class="field ${cls}"><span class="flabel">${esc(label)}</span>` +
  `<span class="fvalue">${value}</span></div>`;

/** Beschriftete Zeile innerhalb eines Blocks: Label links, Wert rechts. */
export const row = (label: string, value: string): string =>
  `<div class="row"><span class="rlabel">${esc(label)}</span><span class="rvalue">${value}</span></div>`;

export interface BlockOptions {
  /** Zusätzliche Klassen am Rahmen, z. B. für Spaltenbreite. */
  cls?: string;
  /** Rechts neben dem Titel, etwa „max. 5". */
  hint?: string;
}

/**
 * Ein gerahmter Abschnitt; der Titel liegt auf der oberen Rahmenlinie. `break-inside: avoid`
 * hängt an `.block` — ein Block wandert lieber ganz auf die nächste Seite, als mitten
 * durchgeschnitten zu werden.
 */
export function block(title: string, body: string, { cls = '', hint = '' }: BlockOptions = {}): string {
  const head = `<div class="bhead"><span class="btitle">${esc(title)}</span>` +
    (hint ? `<span class="bhint">${esc(hint)}</span>` : '') + '</div>';
  return `<section class="block ${cls}">${head}<div class="bbody">${body}</div></section>`;
}

/**
 * Eine Tabelle aus Kopfzeile und Zeilen; Zellen sind bereits fertiges HTML. Die Ausrichtung
 * der Überschrift kommt aus der ersten Datenzeile: pauschal rechtsbündig stand „Reichweite"
 * 26 mm neben seiner linksbündigen Spalte.
 */
export function table(headers: string[], rows: string[][], cls = ''): string {
  const numeric = (i: number): boolean => !!rows[0]?.[i]?.includes('class="num"');
  const head = `<tr>${headers.map((h, i) =>
    `<th${numeric(i) ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr>`;
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
  return `<table class="tbl ${cls}"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}
