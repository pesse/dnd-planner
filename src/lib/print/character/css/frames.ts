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

/** Viertelbogen bis zur Diagonale, wo die gespiegelte Hälfte ansetzt. */
const arc = (offset: number): string => {
  const r = radius(offset);
  const end = (PIVOT - Math.SQRT1_2 * r).toFixed(2);
  return `A ${r} ${r} 0 0 0 ${end} ${end}`;
};

/** Der Punkt sitzt auf der Diagonale, mittig zwischen den Bögen. */
const DOT = (PIVOT - Math.SQRT1_2 * (radius(OUTER) + radius(INNER)) / 2).toFixed(2);

/**
 * Die obere Hälfte der Ecke oben links: gerade Linie von der Kante, Häkchen nach innen, Lücke,
 * Viertelbogen bis zur Diagonale. Die linke Hälfte ist dieselbe Zeichnung an der Diagonale
 * gespiegelt, die drei anderen Ecken sind gespiegelte Kopien des Ganzen.
 */
const HALF_CORNER = `
  <path d="M ${CORNER + 0.5} ${OUTER} H 21.5" />
  <path d="M 21.5 ${OUTER} a 2.2 2.2 0 0 0 0 4.4" stroke-linecap="round" />
  <path d="M ${PIVOT} ${OUTER} ${arc(OUTER)}" />
  <path d="M ${CORNER + 0.5} ${INNER} H ${PIVOT} ${arc(INNER)}" stroke-width="${INNER_W}" />
`;

/** Die vier Kantenfelder einer Linie; sie überlappen die Eckkacheln, sonst klafft die Naht. */
const edges = (offset: number): string => {
  const far = SIDE - offset;
  const from = CORNER - 0.5;
  const to = SIDE - CORNER + 0.5;
  return `M ${from} ${offset} H ${to} M ${from} ${far} H ${to}`
    + ` M ${offset} ${from} V ${to} M ${far} ${from} V ${to}`;
};

const FRAME_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIDE}" height="${SIDE}"`
  + ` viewBox="0 0 ${SIDE} ${SIDE}" fill="none" stroke="INK" stroke-width="${OUTER_W}">`
  + `<defs><g id="h">${HALF_CORNER}</g>`
  + `<g id="c"><use href="#h" /><use href="#h" transform="matrix(0 1 1 0 0 0)" />`
  + `<circle cx="${DOT}" cy="${DOT}" r="1.5" stroke="none" fill="INK" /></g></defs>`
  + `<use href="#c" />`
  + `<use href="#c" transform="translate(${SIDE} 0) scale(-1 1)" />`
  + `<use href="#c" transform="translate(0 ${SIDE}) scale(1 -1)" />`
  + `<use href="#c" transform="translate(${SIDE} ${SIDE}) scale(-1 -1)" />`
  // In den Kantenfeldern nur gerade Linien mit stumpfen Enden: sie werden auf die Kastenbreite
  // gestreckt, eine runde Kappe würde dabei zum Klecks.
  + `<path d="${edges(OUTER)}" />`
  + `<path d="${edges(INNER)}" stroke-width="${INNER_W}" />`
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
