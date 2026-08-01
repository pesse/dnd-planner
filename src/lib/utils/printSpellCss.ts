/**
 * Geometrie und Stylesheet der gedruckten Zauberkarten (3×3 auf A4).
 * Die Maße teilt sich das Mess-Div der Pagination, siehe `printSpell.ts`.
 */
import { RULE_TEXT_PRINT_CSS } from './printCss';

export const FONT_FAMILY = "'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif";
export const FONT_SIZE = '7pt';
export const LINE_HEIGHT = '1.38';

// Mess-Div muss exakt die .desc-Geometrie nachbilden: 70mm Karte − 0,9mm Rahmen
// − 2×5mm Padding = 59mm Textbreite, mit border-box also width:69mm.
export const DESC_WIDTH = '69mm';
export const DESC_PADDING = '1mm 5mm';

export const CARD_CSS = `
@page { size: A4 portrait; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: ${FONT_FAMILY}; background: white; color: #1a0a00; }

.page {
  width: 210mm; height: 297mm;
  display: grid;
  grid-template-columns: repeat(3, 70mm);
  grid-template-rows: repeat(3, 99mm);
  page-break-after: always; break-after: page;
}
.page:last-child { page-break-after: auto; break-after: auto; }

.card {
  position: relative;
  width: 70mm; height: 99mm;
  border: 0.45mm solid #9a7a3a;  /* neutraler Rahmen — Farbe nicht per Schule */
  border-radius: 2.5mm;
  display: flex; flex-direction: column;
  overflow: hidden;
  background: #fef8ec;
}
.card::after {
  content: '';
  position: absolute;
  inset: 1mm;
  border: 0.2mm solid #c4a050;
  border-radius: 2mm;
  pointer-events: none;
  z-index: 5;
}
.card.empty { background: #f5f5f0; border-color: #bbb; }
.card.empty::after { display: none; }

.stripe { display: none; }

.head {
  padding: 2mm 5mm 1.8mm;
  text-align: center;
  flex-shrink: 0;
  background: linear-gradient(to bottom,
    color-mix(in srgb, var(--c) 55%, #fef8ec) 0%,
    color-mix(in srgb, var(--c) 10%, #fef8ec) 100%);
}
.name {
  font-size: 8.5pt; font-weight: 700; font-variant: small-caps;
  color: #1a0a00; line-height: 1.2; letter-spacing: 0.02em;
}
.ritual {
  font-size: 5pt; font-weight: 700; font-variant: normal;
  background: var(--c); color: white;
  border-radius: 0.8mm; padding: 0.2mm 1mm;
  vertical-align: middle; text-transform: uppercase; letter-spacing: 0.06em;
}
.meta {
  font-size: 5.5pt; color: color-mix(in srgb, var(--c) 80%, #333);
  margin-top: 0.4mm; font-style: italic;
}

.orndiv {
  display: flex; align-items: center; gap: 1.5mm;
  margin: 0 3.5mm 0; flex-shrink: 0;
}
.ol {
  flex: 1; height: 0.3mm;
  background: linear-gradient(to right, transparent, var(--c) 30%, var(--c) 70%, transparent);
}
.orndiv .ol:last-child {
  background: linear-gradient(to left, transparent, var(--c) 30%, var(--c) 70%, transparent);
}
.og {
  font-size: 5.5pt; color: var(--c); line-height: 1;
  font-style: normal; font-variant: normal;
}

.props {
  padding: 0.8mm 5mm;
  flex-shrink: 0;
  display: flex; flex-direction: column; gap: 0.5mm;
}
.prop-row { font-size: 6pt; line-height: 1.3; }
.pc {
  display: inline;
  margin-right: 2.5mm;
}
.pc .icon { margin-right: 0.7mm; }
.prop {
  font-size: 6pt; line-height: 1.3;
  display: flex; align-items: baseline; gap: 1.5mm;
}
.icon {
  font-size: 7pt; color: var(--c);
  flex-shrink: 0; width: 3mm; text-align: center;
  font-style: normal; font-variant: normal; display: inline;
}
.mat { color: #888; font-style: italic; }

.desc {
  flex: 1;
  padding: 1mm 5mm 1mm;
  font-size: ${FONT_SIZE};
  line-height: ${LINE_HEIGHT};
  color: #1a0a00;
  overflow: hidden;
  min-height: 0;
}
.desc-full { padding-top: 1.2mm; }

.higher {
  margin-top: 1.2mm;
  font-size: 6pt; line-height: 1.3;
  color: #3a2800;
}
.higher-lbl { font-weight: 700; color: var(--c); }

.foot {
  height: 5.5mm;
  display: flex; align-items: center; justify-content: center;
  padding-bottom: 1.2mm;
  font-size: 5.5pt; color: #888; font-style: italic;
  border-top: 0.3mm solid #c4a050;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--c) 6%, #fef8ec);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.head-cont {
  padding: 2.5mm 5mm 1mm;
  display: flex; align-items: baseline; gap: 1.5mm;
  flex-shrink: 0;
  background: linear-gradient(to bottom,
    color-mix(in srgb, var(--c) 30%, #fef8ec) 0%,
    color-mix(in srgb, var(--c) 6%, #fef8ec) 100%);
  justify-content: center;
}
.name-sm {
  font-size: 7.5pt; font-weight: 700; font-variant: small-caps; color: #1a0a00;
}
.cont-lbl { font-size: 5.5pt; color: #aaa; font-style: italic; }
${RULE_TEXT_PRINT_CSS}
`;
