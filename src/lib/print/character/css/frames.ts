/**
 * Der verspielte Rahmen der Kästen: doppelte Linie mit Eck-Schnörkel, als `border-image` über
 * alle Kastengrößen — die Ecken bleiben fix, die Kanten dazwischen werden gestreckt.
 */

/** Eine Einheit ist 0,1 mm; die Eckkachel ist damit genau so breit wie der Rahmen. */
const CORNER = 24;
const SIDE = 80;

/**
 * Abstand der beiden Linien vom Kastenrand und ihre Strichstärken. Der Zwischenraum ist der
 * Engpass: unter etwa 0,8 mm läuft er auf Papier zu und aus dem Linienpaar wird ein schwarzer
 * Balken. Denselben Mindestabstand hält auch alles am Ornament.
 */
const OUTER = 2.5;
const OUTER_W = 2.4;
const INNER = 12.5;
const INNER_W = 1.2;

/**
 * Beide Eckbögen laufen um denselben Mittelpunkt — nur so bleiben sie über die Rundung hinweg
 * gleich weit auseinander. Ihr Radius folgt daraus, und weil er zugleich der Abstand zur
 * Geraden ist, schließt jeder Bogen tangential an: die Lücke davor fällt nicht auf.
 */
const PIVOT = 17;
const radius = (offset: number): number => PIVOT - offset;

const fmt = (n: number): string => n.toFixed(2);

/**
 * Viertelbogen von oben bis zur Diagonale, wo die gespiegelte Hälfte ansetzt — als gefülltes
 * Ringstück der Breite `width`.
 */
const arcBand = (offset: number, width: number): string => {
  const outer = radius(offset) + width / 2;
  const inner = radius(offset) - width / 2;
  const diag = (r: number): string => fmt(PIVOT - Math.SQRT1_2 * r);
  return `<path d="M ${PIVOT} ${fmt(PIVOT - outer)} A ${outer} ${outer} 0 0 0 ${diag(outer)} ${diag(outer)}`
    + ` L ${diag(inner)} ${diag(inner)} A ${inner} ${inner} 0 0 1 ${PIVOT} ${fmt(PIVOT - inner)} Z" />`;
};

const bar = (x: number, y: number, w: number, h: number): string =>
  `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" />`;

/** Waagrechte Linie von `x1` bis `x2` auf Höhe `y`. */
const hLine = (x1: number, x2: number, y: number, width: number): string =>
  bar(x1, y - width / 2, x2 - x1, width);

/** Halbkreis-Häkchen nach innen, unten mit runder Kappe. */
const HOOK_X = 21.5;
const HOOK_R = 2.2;
const hook = (): string => {
  const w = OUTER_W / 2;
  const cy = OUTER + HOOK_R;
  const [ro, ri] = [HOOK_R + w, HOOK_R - w];
  return `<path d="M ${HOOK_X} ${fmt(cy - ro)} A ${ro} ${ro} 0 0 0 ${HOOK_X} ${fmt(cy + ro)}`
    + ` A ${w} ${w} 0 0 0 ${HOOK_X} ${fmt(cy + ri)}`
    + ` A ${ri} ${ri} 0 0 1 ${HOOK_X} ${fmt(cy - ri)} Z" />`;
};

/** Der Punkt sitzt auf der Diagonale, mittig zwischen den Bögen. */
const DOT = fmt(PIVOT - Math.SQRT1_2 * (radius(OUTER) + radius(INNER)) / 2);

/**
 * Die obere Hälfte der Ecke oben links: gerade Linie von der Kante, Häkchen nach innen, Lücke,
 * Viertelbogen bis zur Diagonale. Die linke Hälfte ist dieselbe Zeichnung an der Diagonale
 * gespiegelt, die drei anderen Ecken sind gespiegelte Kopien des Ganzen.
 */
const HALF_CORNER = hLine(HOOK_X, CORNER + 0.5, OUTER, OUTER_W) + hook() + arcBand(OUTER, OUTER_W)
  + hLine(PIVOT, CORNER + 0.5, INNER, INNER_W) + arcBand(INNER, INNER_W);

/** Die vier Kantenfelder einer Linie; sie überlappen die Eckkacheln, sonst klafft die Naht. */
const edges = (offset: number, width: number): string => {
  const far = SIDE - offset;
  const from = CORNER - 0.5;
  const to = SIDE - CORNER + 0.5;
  return hLine(from, to, offset, width) + hLine(from, to, far, width)
    + bar(offset - width / 2, from, width, to - from) + bar(far - width / 2, from, width, to - from);
};

/**
 * Nur gefüllte Flächen, kein einziger Strich: Druckertreiber skalieren eine Strichstärke beim
 * Strecken und Spiegeln falsch — Kanten und Ecken liefen sonst zu schwarzen Balken zusammen.
 */
const FRAME_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIDE}" height="${SIDE}"`
  + ` viewBox="0 0 ${SIDE} ${SIDE}" fill="INK" stroke="none">`
  + `<defs><g id="h">${HALF_CORNER}</g>`
  + `<g id="c"><use href="#h" /><use href="#h" transform="matrix(0 1 1 0 0 0)" />`
  + `<circle cx="${DOT}" cy="${DOT}" r="1.5" /></g></defs>`
  + `<use href="#c" />`
  + `<use href="#c" transform="translate(${SIDE} 0) scale(-1 1)" />`
  + `<use href="#c" transform="translate(0 ${SIDE}) scale(1 -1)" />`
  + `<use href="#c" transform="translate(${SIDE} ${SIDE}) scale(-1 -1)" />`
  + edges(OUTER, OUTER_W) + edges(INNER, INNER_W)
  + `</svg>`;

/** Die Palette lebt in CSS-Variablen, die eine Data-URL nicht sieht — die Tinte kommt als Wert. */
const frameUrl = (ink: string): string =>
  `url("data:image/svg+xml,${encodeURIComponent(FRAME_SVG.replace(/INK/g, ink))}")`;

export const FRAME_WIDTH_MM = CORNER / 10;

export const FRAME_CSS = `
/* Rahmenbreite IST der Innenabstand: das Ornament braucht den Platz, den es einnimmt. */
.block, .tf, .o-disc:not(.o-shield) {
  border: ${FRAME_WIDTH_MM}mm solid transparent;
  border-image: ${frameUrl('#14100a')} ${CORNER} stretch;
  border-radius: 1.4mm;
  background: var(--paper);
}
`;
