/**
 * Das feste Raster des Übersichtsblatts. Die linken Spalten enden mit ihrem Inhalt; die
 * Blatthöhe, die übrig bleibt, gehen die Kästen ein, in die geschrieben wird (`flex: 1`) —
 * Notizfläche und Angriffe.
 */
import { FRAME_WIDTH_MM } from './frames';

export const OVERVIEW_CSS = `
.sheet {
  display: grid;
  grid-template-columns: 27mm 64mm 1fr;
  grid-template-rows: auto auto 1fr;
  grid-template-areas:
    "head  head  head"
    "attrs mid   main"
    "extra extra main";
  gap: 2mm;
  min-height: 285mm;
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
.tf > .tcap, .o-disc:not(.o-shield) > .tcap {
  position: absolute; top: -${FRAME_WIDTH_MM}mm; left: 50%; transform: translateX(-50%);
  margin: 0; padding: 0 1.2mm; line-height: 1; background: var(--paper); white-space: nowrap;
}
/* Grauer Rückgrund hinter einer Gruppe — er fasst zusammen, was zusammengehört. */
.o-panel { background: var(--panel); border-radius: 3mm; padding: 1.6mm;
           display: flex; flex-direction: column; gap: 2mm; min-height: 0; }

/* Kopf: Namensbanner, Rüstungsklasse und Bewegungsrate, Kennfelder. Das Polster oben ist die
   Rahmenbreite: darin liegen deren Beschriftungen, sonst schneidet sie der Blattrand ab. */
.o-head { grid-area: head; display: grid; grid-template-columns: 1fr auto 0.92fr; gap: 2mm;
          padding-top: ${FRAME_WIDTH_MM}mm; }
.o-head-solo { grid-template-columns: 1fr auto; }
.o-namebox { flex-direction: row; align-items: stretch; gap: 2.5mm; }
.o-namecol { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
.o-namecol .tcap { margin-top: auto; padding-top: 0.8mm; }
.o-portrait { flex: 0 0 auto; width: 21mm; align-self: stretch; object-fit: cover;
              border: 0.25mm solid var(--rule); border-radius: 1.2mm; }
.o-name { font-size: 17pt; font-weight: 700; line-height: 1.1; }
.o-idbox { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.5mm 2mm;
           align-content: center; padding: 2mm 2.4mm; }
/* „Zauberer 3 (Wildmagie-Zauberei)" bricht in der halben Kastenbreite um. */
.o-id:first-child { grid-column: 1 / -1; }
.o-id { border-bottom: 0.25mm solid var(--rule); padding: 0 0.6mm; min-width: 0; }
.o-id-val { display: block; font-size: 8.6pt; font-weight: 600; line-height: 1.15; }
.o-id .tcap { margin: 0; padding: 0.3mm 0 0; }

/* Attributssäule: Wert im stehenden Oval unter dem Modifikator */
.o-attrs { grid-area: attrs; display: flex; flex-direction: column; gap: 1.6mm;
           background: var(--panel); border-radius: 3mm; padding: 1.6mm; }
.o-attr { flex: 1; align-items: center; justify-content: center; padding: 0.6mm 0 0.4mm; }
/* Der Name steht auf der Rahmenlinie: „Geschicklichkeit" passt bei 5 pt nicht in die 22 mm
   Innenbreite, über der Linie darf er überstehen. */
.o-attr-name { font-size: 5pt; letter-spacing: 0.01em; }
.o-attr-mod { font-size: 14pt; font-weight: 700; line-height: 1; }
.o-attr-score { width: 8mm; height: 9mm; margin-top: 0.5mm; border: 0.35mm solid var(--rule);
                border-radius: 50%; display: flex; align-items: center; justify-content: center;
                font-size: 7.6pt; font-weight: 600; }

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

/* Mittelspalte: die Fertigkeiten auf grauem Grund */
.o-mid { grid-area: mid; display: flex; flex-direction: column; gap: 1.6mm; }
.o-lines { display: flex; flex-direction: column; }
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

/* Unter der Attributssäule: passive Wahrnehmung, Übungen, Waffenmeisterschaft, Notizfläche */
.o-extra { grid-area: extra; display: flex; flex-direction: column; gap: 2mm; min-height: 0; }
/* Im Raster steht der Block als Kasten, nicht als Absatz im Spaltenfluss. */
.o-extra .block { margin-bottom: 0; }
.o-notes { flex: 1; min-height: 14mm; }
.o-ruled { flex: 1; margin: 0.8mm 0.6mm 0;
           background-image: repeating-linear-gradient(var(--paper) 0 6.2mm,
             var(--rule-soft) 6.2mm 6.35mm); }
.o-plbl { font-size: 5.6pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; }
/* Spaltenweise gefüllt: sonst steht „Leichte Rüstung" in der Waffenzeile. */
.o-radios { display: grid; grid-template-columns: repeat(3, 1fr); grid-auto-flow: column;
            grid-template-rows: repeat(2, auto); gap: 0.8mm 2mm; margin: 0.6mm 0 1.4mm; }
.o-radio { display: flex; align-items: center; gap: 1mm; font-size: 7pt; }
.o-plist { font-size: 7.2pt; line-height: 1.25; margin-top: 1mm; }
.o-plist .o-plbl { display: block; }

/* Rechte Bahn: Trefferpunkte mit Rettungswürfen, darunter die Angriffe */
.o-main { grid-area: main; display: flex; flex-direction: column; gap: 2mm; min-width: 0; }
.o-vitals { display: grid; grid-template-columns: 1fr 45mm; gap: 1.6mm;
            background: var(--panel); border-radius: 3mm; padding: 1.6mm; }
.o-hpcol, .o-savecol { display: flex; flex-direction: column; gap: 1.6mm; }
/* Feste Breite im Kopfband: der Schild trägt die längere Beschriftung. */
.o-discs { display: flex; gap: 1.6mm; min-height: 19mm; }
.o-discs > .o-disc { flex: 0 0 22mm; }
.o-discs > .o-shield { flex: 0 0 26mm; max-width: 26mm; }
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
/* Auch ohne Wert bleibt die Zeile stehen — der Kasten ist dann die Schreibfläche. */
.o-disc-val { display: block; font-size: 13pt; font-weight: 700; line-height: 1.05;
              min-height: 1.05em; }
/* Die Kampfwerte stehen in schmalen Kästen: „Rettungswürfe gegen Tod" muss in 45 mm passen,
   „Bewegungsrate" in 22 mm. */
.o-disc:not(.o-shield) > .tcap, .o-hp > .tcap, .o-deathbox > .tcap {
  font-size: 4.6pt; letter-spacing: 0.03em; padding: 0 0.8mm; }
.o-hp { flex: 1; }
/* Die Mindesthöhen bleiben unter der Höhe der Rettungswürfe-Spalte: die gibt das Maß vor,
   die Trefferpunkt-Kästen dehnen sich darin auf. */
.o-hp-cur { flex: 2; min-height: 18mm; }
.o-hp-tmp { min-height: 11mm; }
/* Kein Abstreichfeld, nur ein Wert: der Kasten nimmt seine Zeile und dehnt sich nicht. */
.o-hp-dice { flex: 0 0 auto; min-height: 11mm; }
.o-capline { display: flex; align-items: baseline; gap: 1.5mm; }
.o-dice { text-align: center; font-size: 10pt; font-weight: 700; }
.o-capval { flex: 1; padding: 0 0 0.4mm 1mm; border-bottom: 0.25mm solid var(--rule-soft);
            font-size: 9.5pt; font-weight: 700; }
.o-write { flex: 1; display: flex; align-items: center; justify-content: center; }
.o-write-val { font-size: 15pt; font-weight: 700; }
.o-deathbox { justify-content: center; }
.o-death { display: flex; align-items: center; justify-content: space-between; gap: 1.4mm;
           padding: 0.3mm 0; }
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
/* Notizzeile hängt unter dem Namen; auf bottom stünden Bonus und Schaden neben ihr. */
.o-atk tr.has-note td { vertical-align: top; }
.o-atk .anote { display: block; font-size: 6pt; font-style: italic; color: var(--ink-label); }

`;
