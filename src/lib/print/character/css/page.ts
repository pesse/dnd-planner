/**
 * Seitenrahmen, Palette und Typografie des Charakterbogens — angelehnt an den
 * Taendler-Bogen: gerahmte Kästen, Kapitälchen-Beschriftungen, Serifenschrift.
 */
import { FONT_FAMILY } from '$lib/utils/printSpellCss';
import { FRAME_WIDTH_MM } from './frames';

/** Das Iframe-Dokument sieht app.css nicht; die Werte stehen deshalb hier als Literale. */
const PALETTE = `
:root {
  --ink:       #14100a;
  --ink-soft:  #302819;
  --ink-label: #332b1e;
  --rule:      #14100a;
  --rule-soft: #8b8071;
  --tint:      #e4e0d7;
  --fill:      #dcd8ce;
  --panel:     #e6e2d9;
  --paper:     #ffffff;
}
`;

export const PAGE_CSS = `
${PALETTE}
@page { size: A4 portrait; margin: 5mm 4mm; }

* { box-sizing: border-box; margin: 0; padding: 0;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }

body {
  font-family: ${FONT_FAMILY};
  background: var(--paper);
  color: var(--ink);
  font-size: 8.4pt;
  line-height: 1.32;
}

/* Mehrspaltensatz statt Raster: die Blöcke packen sich dicht, statt auf Zeilenhöhe
   gestreckt zu werden, und der Umbruch entsteht erst beim Drucken. */
.page { column-count: 2; column-gap: 2.5mm; }
.page + .page { break-before: page; }
.page-head { column-span: all; text-align: right; font-size: 6pt; font-weight: 700;
             text-transform: uppercase; letter-spacing: 0.09em; color: var(--ink-label);
             border-bottom: 0.2mm solid var(--rule-soft); padding-bottom: 0.6mm; margin-bottom: 1.6mm; }
/* Die Übersicht ist ein eigenes Blatt — was danach kommt, fängt vorne an. */
.sheet { break-after: page; }

.block {
  position: relative;
  break-inside: avoid;
  margin-bottom: 2.6mm;
  /* Schmaler als die eigene Überschrift wird kein Kasten (--head-w aus html.ts); die Deckelung
     hält ihn trotzdem in seiner Spalte, statt über deren Rand zu ragen. */
  min-width: min(100%, var(--head-w, 0mm));
}
/* Etwas Luft nach oben: der Titel auf der Rahmenlinie greift sonst in den Kasten der
   vorangehenden Spalte. */
.block.wide { column-span: all; margin-top: 1.2mm; }
/* Ein langer Kasten läuft innen zweispaltig, statt sich über die Seitenbahnen zu verteilen:
   so bleiben Zaubergrade und Merkmalstext in einem Rahmen und in Leserichtung. Passt er nicht
   mehr aufs Blatt, wandert er als Ganzes weiter (.long fehlt hier bewusst). */
.block.cols .bbody { column-count: 2; column-gap: 5mm; }
/* Was für die ganze Gruppe gilt, steht über beiden Spalten — nicht in der ersten. */
.block.cols .bbody > .full { column-span: all; }
/* Lange Listen dürfen umbrechen — sonst schiebt sich ein zu großer Kasten komplett auf
   die nächste Seite und lässt die halbe davor leer. Die Einheiten darin (Merkmal,
   Zaubergrad, Tabellenzeile) bleiben trotzdem zusammen. */
.block.long { break-inside: auto; }
.tbl tr { break-inside: avoid; }

/* Titel oben, Hinweis unten — nebeneinander drängen sie sich im schmalen Kasten
   („Zauberplätze" + „Lange Rast") gegenseitig aus dem Rahmenband. Beide bleiben ganz darin;
   was darüber hinausragt, schneidet der Seitenrand ab, sobald der Kasten oben auf einer
   Folgeseite steht. */
.bhead, .bfoot {
  position: absolute; left: 3mm; right: 3mm; line-height: 1;
  display: flex; align-items: baseline; justify-content: center;
}
.bhead { top: -${FRAME_WIDTH_MM}mm; }
.bfoot { bottom: -${FRAME_WIDTH_MM}mm; }
.btitle { font-size: 6.2pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.09em; }
.bhint  { font-size: 6.5pt; font-style: italic; color: var(--ink-label); }
/* Die Beschriftung deckt die Rahmenlinie auf ihrer Breite ab; umbrechen darf sie dabei nicht,
   sonst steht die zweite Zeile im Kasten statt auf der Linie. */
.btitle, .bhint { background: var(--paper); padding: 0 1.4mm; white-space: nowrap; }
.bbody  { padding: 0.6mm 0.4mm 0.2mm; }

/* Beschriftetes Wertfeld */
.field { display: flex; flex-direction: column; align-items: center; justify-content: center;
         border: 0.3mm solid var(--rule); border-radius: 1.2mm; padding: 0.8mm 1.4mm; min-width: 0; }
.flabel { font-size: 5.9pt; text-transform: uppercase; letter-spacing: 0.07em; color: var(--ink-label); white-space: nowrap; }
.fvalue { font-size: 10pt; font-weight: 700; line-height: 1.15; }
.field.small .fvalue { font-size: 8.4pt; font-weight: 600; }

/* Label/Wert-Zeile — der Wert darf umbrechen, Übungslisten werden lang. */
.row { display: grid; grid-template-columns: 19mm 1fr; gap: 1.5mm; padding: 0.35mm 0; align-items: baseline; }
.row + .row { border-top: 0.15mm dotted var(--rule-soft); }
.rlabel { color: var(--ink-label); font-size: 6.4pt; text-transform: uppercase; letter-spacing: 0.05em; }
.rvalue { font-weight: 600; }

/* Zwei Zeichen, zwei Bedeutungen: Kreis = Verbrauch (Plätze, Punkte, Anwendungen),
   Quadrat = Besitz (vorbereitet, gewählt). Alles ≥ 3,2 mm, sonst trifft es kein Stift. */
.ticks, .slots { display: inline-flex; flex-wrap: wrap; gap: 0.9mm; vertical-align: middle; }
.tick  { width: 3.2mm; height: 3.2mm; border: 0.3mm solid var(--rule); border-radius: 50%; display: inline-block; }
.slot  { width: 3.2mm; height: 3.2mm; border: 0.3mm solid var(--rule); border-radius: 50%; display: inline-block; }
/* Zeile zum Eintragen, wo eine Wahl noch offen ist. */
.wline { min-height: 4mm; border-bottom: 0.2mm dotted var(--rule); margin-top: 1mm; }
/* Dasselbe in einer Tabellenzeile: die Linie kommt von der Zelle, die Höhe von hier. */
.wcell { display: block; min-height: 3.8mm; }
.chain { display: inline-flex; align-items: center; }
.link { width: 1.6mm; border-top: 0.3mm solid var(--rule); }
.cbox  { width: 3.2mm; height: 3.2mm; border: 0.3mm solid var(--rule); border-radius: 0.4mm;
         display: inline-block; vertical-align: -0.6mm; position: relative; }
.cbox.on::after { content: ''; position: absolute; inset: 0.5mm; background: var(--ink-soft); border-radius: 0.2mm; }

/* Tabellen */
.tbl { width: 100%; border-collapse: collapse; }
.tbl th { font-size: 6pt; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-label);
          text-align: left; font-weight: 600; padding: 0 1mm 0.5mm; border-bottom: 0.25mm solid var(--rule-soft); }
.tbl td { padding: 0.55mm 1mm; border-bottom: 0.15mm dotted var(--rule-soft); vertical-align: top; }
.tbl tbody tr:last-child td { border-bottom: none; }
.tbl .num { text-align: right; white-space: nowrap; }
/* Nur die Zelle darunter, nicht die Überschrift: ein display:block am th verlässt das
   Tabellenraster, die Kopfzeile stapelt sich dann übereinander. */
.tbl td .num { display: block; }
/* Feste Spaltenbreiten: sonst bestimmt der längste Gegenstand, wie breit „Gew." wird. */
.tbl.inv { table-layout: fixed; }
.tbl.inv th:first-child, .tbl.inv td:first-child { width: 74%; }
.tbl.inv th:not(:first-child), .tbl.inv td:not(:first-child) { width: 13%; }

/* Ein Absatz bleibt zusammen; sonst steht die Überschrift am Spaltenfuß und ihr Text oben
   in der nächsten Spalte. */
.prose p { break-inside: avoid; orphans: 2; widows: 2; }
.prose p + p { margin-top: 1.4mm; }
.phead { text-transform: uppercase; letter-spacing: 0.05em; font-size: 6.4pt; }
`;
