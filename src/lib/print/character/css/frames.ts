/**
 * Der verspielte Rahmen der Kästen: doppelte Linie mit Eck-Schnörkel, als `border-image` über
 * alle Kastengrößen — die Ecken bleiben fix, die Kanten dazwischen werden gestreckt.
 */

/** Eine Einheit ist 0,1 mm; die Eckkachel ist damit genau so breit wie der Rahmen. */
const CORNER = 24;
const SIDE = 80;

/**
 * Die obere Hälfte der Ecke oben links: gerade Linie von der Kante, Häkchen nach innen, Lücke,
 * Viertelbogen bis zur Diagonale. Die linke Hälfte ist dieselbe Zeichnung an der Diagonale
 * gespiegelt, die drei anderen Ecken sind gespiegelte Kopien des Ganzen.
 */
const HALF_CORNER = `
  <path d="M 24.5 2.5 H 17.6" />
  <path d="M 17.6 2.5 a 2.7 2.7 0 0 0 0 5.4" stroke-linecap="round" />
  <path d="M 14 2.5 A 12 12 0 0 0 5.6 5.6" />
  <path d="M 24.5 9 H 21.5 A 12.5 12.5 0 0 0 12.7 12.7" stroke-width="1.6" />
`;

const FRAME_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIDE}" height="${SIDE}"`
  + ` viewBox="0 0 ${SIDE} ${SIDE}" fill="none" stroke="INK" stroke-width="3.2">`
  + `<defs><g id="h">${HALF_CORNER}</g>`
  + `<g id="c"><use href="#h" /><use href="#h" transform="matrix(0 1 1 0 0 0)" />`
  + `<circle cx="7.6" cy="7.6" r="1.7" stroke="none" fill="INK" /></g></defs>`
  + `<use href="#c" />`
  + `<use href="#c" transform="translate(${SIDE} 0) scale(-1 1)" />`
  + `<use href="#c" transform="translate(0 ${SIDE}) scale(1 -1)" />`
  + `<use href="#c" transform="translate(${SIDE} ${SIDE}) scale(-1 -1)" />`
  // In den Kantenfeldern nur gerade Linien mit stumpfen Enden: sie werden auf die Kastenbreite
  // gestreckt, eine runde Kappe würde dabei zum Klecks.
  + `<path d="M 23.5 2.5 H 56.5 M 23.5 77.5 H 56.5 M 2.5 23.5 V 56.5 M 77.5 23.5 V 56.5" />`
  + `<path d="M 23.5 9 H 56.5 M 23.5 71 H 56.5 M 9 23.5 V 56.5 M 71 23.5 V 56.5"`
  + ` stroke-width="1.6" />`
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
