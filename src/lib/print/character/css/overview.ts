/**
 * Das feste Raster des Übersichtsblatts. Die Kästen dehnen sich über die Blatthöhe (`flex: 1`),
 * damit leere Felder Schreibfläche werden statt Luft am Seitenende.
 */
import { FRAME_WIDTH_MM } from './frames';

export const OVERVIEW_CSS = `
.sheet {
  display: grid;
  grid-template-columns: 27mm 64mm 1fr;
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    "head  head  head"
    "attrs mid   main"
    "extra extra main";
  gap: 2mm;
  min-height: 279mm;
}

/* Kasten mit Beschriftung auf der oberen Rahmenlinie */
.tf { position: relative; padding: 0.4mm 0.4mm 0.2mm;
      display: flex; flex-direction: column; min-height: 0; }
.tcap { margin-top: auto; padding-top: 0.6mm; text-align: center; font-size: 5.4pt;
        font-weight: 700; text-transform: uppercase; letter-spacing: 0.09em; color: var(--ink); }
.tcap.left { text-align: left; }
/* Die Beschriftung deckt die Rahmenlinie auf ihrer Breite ab, links und rechts läuft sie weiter.
   Sie bleibt ganz im Rahmenband, wie .bhead. Beschriftungen innerhalb eines Kastens (.o-id,
   .o-namecol) bleiben im Fluss. */
.tf > .tcap:not(.o-attr-name), .o-disc:not(.o-shield) > .tcap {
  position: absolute; top: -${FRAME_WIDTH_MM}mm; left: 50%; transform: translateX(-50%);
  margin: 0; padding: 0 1.2mm; line-height: 1; background: var(--paper); white-space: nowrap;
}
/* Grauer Rückgrund hinter einer Gruppe — er fasst zusammen, was zusammengehört. */
.o-panel { background: var(--panel); border-radius: 3mm; padding: 1.6mm;
           display: flex; flex-direction: column; gap: 2mm; flex: 1; min-height: 0; }

/* Kopf: Namensbanner und die Kennfelder */
.o-head { grid-area: head; display: grid; grid-template-columns: 1fr 1fr; gap: 2mm; }
.o-head-solo { grid-template-columns: 1fr; }
.o-namebox { flex-direction: row; align-items: stretch; gap: 2.5mm; }
.o-namecol { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
.o-namecol .tcap { margin-top: auto; padding-top: 0.8mm; }
.o-portrait { width: 17mm; height: 21mm; object-fit: cover; border: 0.25mm solid var(--rule);
              border-radius: 1.2mm; }
.o-name { font-size: 17pt; font-weight: 700; line-height: 1.1; }
.o-idbox { display: grid; grid-template-columns: repeat(6, 1fr); gap: 1.5mm 2mm;
           align-content: center; padding: 2mm 2.4mm; }
.o-id:nth-child(-n+2) { grid-column: span 3; }
.o-id:nth-child(n+3) { grid-column: span 2; }
.o-id { border-bottom: 0.25mm solid var(--rule); padding: 0 0.6mm; min-width: 0; }
.o-id-val { display: block; font-size: 8.6pt; font-weight: 600; line-height: 1.15; }
.o-id .tcap { margin: 0; padding: 0.3mm 0 0; }

/* Attributssäule: Wert im stehenden Oval unter dem Modifikator */
.o-attrs { grid-area: attrs; display: flex; flex-direction: column; gap: 1.6mm;
           background: var(--panel); border-radius: 3mm; padding: 1.6mm; }
.o-attr { flex: 1; align-items: center; justify-content: center; padding: 1.6mm 0 1mm; }
/* Der Attributsname steht im Oval, nicht auf seiner Linie; „Geschicklichkeit" muss einzeilig
   in die 19 mm passen, die der Rahmen übrig lässt. */
.o-attr-name { margin: 0 0 auto; padding: 0; font-size: 5pt; letter-spacing: 0.01em; }
.o-attr-mod { font-size: 19pt; font-weight: 700; line-height: 1; }
.o-attr-score { width: 9mm; height: 11mm; margin-top: 0.8mm; border: 0.35mm solid var(--rule);
                border-radius: 50%; display: flex; align-items: center; justify-content: center;
                font-size: 8.4pt; font-weight: 600; }

/* Liegende Kapsel: Wert im Kreis, Beschriftung daneben */
.o-pill { display: flex; align-items: center; gap: 2mm; padding: 0.7mm 2.5mm 0.7mm 0.7mm;
          border: 0.45mm solid var(--rule); border-radius: 6mm; background: var(--paper); }
.o-pill-val { flex: 0 0 auto; width: 8mm; height: 8mm; border: 0.45mm solid var(--rule);
              border-radius: 50%; display: flex; align-items: center; justify-content: center;
              font-size: 10pt; font-weight: 700; }
.o-pill-lbl { flex: 1; text-align: center; font-size: 6.2pt; font-weight: 700;
              text-transform: uppercase; letter-spacing: 0.08em; }
.o-alles { display: flex; align-items: center; gap: 1.2mm; padding-left: 2mm; font-size: 6pt;
           font-style: italic; color: var(--ink-label); }

/* Mittelspalte: Rettungswürfe und Fertigkeiten auf grauem Grund */
.o-mid { grid-area: mid; display: flex; flex-direction: column; gap: 1.6mm; }
.o-skills { flex: 1; }
.o-lines { flex: 1; display: flex; flex-direction: column; justify-content: space-between; }
.o-line { display: grid; grid-template-columns: 3.6mm 9mm 1fr; gap: 0 1.4mm;
          align-items: center; padding: 0.28mm 0; }
.o-val { background: var(--fill); border-radius: 0.8mm; text-align: center; font-weight: 700;
         padding: 0.15mm 0; }
.o-lbl { font-size: 7.6pt; }
.o-lbl em { font-size: 6.5pt; font-style: normal; color: var(--ink-label); }
.pm { width: 3.2mm; height: 3.2mm; border: 0.3mm solid var(--rule); border-radius: 50%;
      display: inline-block; flex: 0 0 auto; }
.pm.on, .pm.exp { background: var(--rule); }
.pm.exp { outline: 0.3mm solid var(--rule); outline-offset: 0.5mm; }

/* Unter der Attributssäule: passive Wahrnehmung und Übungen */
.o-extra { grid-area: extra; display: flex; flex-direction: column; gap: 2mm; }
.o-plbl { font-size: 5.6pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; }
/* Spaltenweise gefüllt: sonst steht „Leichte Rüstung" in der Waffenzeile. */
.o-radios { display: grid; grid-template-columns: repeat(3, 1fr); grid-auto-flow: column;
            grid-template-rows: repeat(2, auto); gap: 0.8mm 2mm; margin: 0.6mm 0 1.4mm; }
.o-radio { display: flex; align-items: center; gap: 1mm; font-size: 7pt; }
.o-plist { font-size: 7.2pt; line-height: 1.25; margin-top: 1mm; }
.o-plist .o-plbl { display: block; }

/* Rechte Bahn: Kampfwerte, Persönlichkeit, Angriffe, Klassenmerkmale */
.o-main { grid-area: main; display: flex; flex-direction: column; gap: 2mm; min-width: 0; }
/* Kampfwerte und Angriffe teilen sich die Höhe, die das Blatt übrig lässt: der Rest wird
   Schreibfläche statt Luft. */
.o-top { flex: 1 1 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 2mm; align-items: stretch; }
.o-top-solo { grid-template-columns: 1fr; }
.o-top-solo .o-discs { min-height: 24mm; }
.o-top-solo .o-hp-cur { min-height: 20mm; }
.o-vitals { display: flex; flex-direction: column; gap: 1.6mm;
            background: var(--panel); border-radius: 3mm; padding: 1.6mm; }
.o-person { display: flex; flex-direction: column; gap: 2mm; }
/* Flex, nicht Grid: fehlt ein Wert, teilen die übrigen Kästen die Breite unter sich auf,
   statt eine leere Rasterspalte offen zu lassen. */
.o-discs { display: flex; gap: 1.6mm; min-height: 19mm; }
.o-disc { position: relative; flex: 1 1 0; padding: 0.4mm 0.2mm 0.2mm; text-align: center;
          display: flex; flex-direction: column; align-items: center; justify-content: center; }
/* Der Schild ist ein zweifach beschnittener Kasten: die untere Ebene trägt die Kontur. */
.o-shield { --shield: polygon(50% 0%, 100% 5%, 100% 63%, 90% 79%, 70% 92%, 50% 100%,
                              30% 92%, 10% 79%, 0% 63%, 0% 5%);
            position: relative; padding: 2.2mm 1mm 5mm;
            background: var(--rule); clip-path: var(--shield);
            max-width: 32mm; margin: 0 auto; width: 100%; }
.o-shield .tcap { display: block; margin: 0; padding-top: 0.4mm;
                  letter-spacing: 0.01em; line-height: 1.05; hyphens: auto; }
.o-shield::before { content: ''; position: absolute; inset: 0.45mm; background: var(--paper);
                    clip-path: var(--shield); }
.o-shield > * { position: relative; }
.o-disc-val { display: block; font-size: 13pt; font-weight: 700; line-height: 1.05; }
/* Die Kampfwerte stehen in schmalen Kästen: „Rettungswürfe gegen Tod" muss in 28 mm passen,
   „Bewegungsrate" in 15 mm. */
.o-disc:not(.o-shield) > .tcap, .o-hp > .tcap, .o-deathbox > .tcap {
  font-size: 4.6pt; letter-spacing: 0.03em; padding: 0 0.8mm; }
.o-hp { flex: 1; }
.o-hp-cur { min-height: 26mm; }
.o-hp-tmp { min-height: 14mm; }
.o-hp-dice { min-height: 12mm; }
.o-capline { display: flex; align-items: baseline; gap: 1.5mm; }
.o-dice { text-align: center; font-size: 10pt; font-weight: 700; }
.o-capval { flex: 1; padding: 0 0 0.4mm 1mm; border-bottom: 0.25mm solid var(--rule-soft);
            font-size: 9.5pt; font-weight: 700; }
.o-write { flex: 1; display: flex; align-items: center; justify-content: center; }
.o-write-val { font-size: 15pt; font-weight: 700; }
.o-duo { display: grid; grid-template-columns: 0.9fr 1.1fr; gap: 1.6mm; }
.o-deathbox { justify-content: center; }
.o-death { display: flex; align-items: center; justify-content: space-between; gap: 1.4mm;
           padding: 0.3mm 0; }
.o-quote { flex: 1 1 auto; min-height: 16mm; }
.o-quote .prose { font-size: 7.2pt; }

.o-atkbox { flex: 1 1 auto; padding-left: 0.8mm; padding-right: 0.8mm; }
/* Die Zeilen verteilen sich über die Kastenhöhe; der Wert sitzt auf seiner Linie. */
.o-atk { width: 100%; height: 100%; table-layout: fixed;
         border-collapse: separate; border-spacing: 0.8mm 0.5mm; }
.o-atk th { font-size: 6pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
            text-align: left; padding: 0 1mm 0.2mm; }
.o-atk th.num { text-align: right; }
.o-atk td { padding: 0.2mm 1mm; font-size: 7.4pt; vertical-align: bottom;
            border-bottom: 0.25mm solid var(--rule-soft); }
.o-atk td.num { text-align: right; }
.o-atk th:first-child, .o-atk td:first-child { width: 34%; }

`;
