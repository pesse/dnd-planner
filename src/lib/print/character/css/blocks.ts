/**
 * Stile der Blöcke neben den beiden festen Blättern: Ressourcen, Options-Pools, Ausrüstung
 * samt Geldmitteln, Merkmalslisten, Zauberlisten.
 */
import { RULE_TEXT_PRINT_CSS } from '$lib/utils/printCss';

export const BLOCK_CSS = `
/* Offene Zeilen und Werte in Meisterschafts-, Pool- und Vorrat-Kästen */
.res-label { font-size: 6.4pt; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-label); }
.res-value { font-size: 9.5pt; font-weight: 700; }

/* Optionen aus einem Pool (Metamagie, Anrufungen) */
.pick { padding: 0.5mm 0; }
.pick + .pick { border-top: 0.15mm dotted var(--rule-soft); }
.pick-name { font-weight: 600; }
.pick-help { color: var(--ink-soft); }

/* Merkmale im Volltext */
.feat { break-inside: avoid; }
.feat + .feat { margin-top: 1.4mm; }
.feat-name { font-weight: 700; }
.feat-level { font-size: 6.4pt; color: var(--ink-label); font-style: italic; }
.feat-choice { font-size: 7.4pt; color: var(--ink-soft); }
.feat-desc { margin-top: 0.3mm; }

/* Ausrüstung: drei Tabellen nebeneinander, die Münzen als schmale Spalte am rechten Rand */
.block.inv > .bbody { display: flex; gap: 0 2.5mm; align-items: stretch; }
.inv-wrap { flex: 1; min-width: 0; }
.inv-cols { display: grid; grid-template-columns: repeat(auto-fill, minmax(52mm, 1fr));
            gap: 0 3mm; align-items: start; }
.inv-notes { margin-top: 1.2mm; padding-top: 1mm; border-top: 0.15mm dotted var(--rule-soft); }
.inv-money { flex: 0 0 15mm; display: flex; flex-direction: column; gap: 1.2mm;
             padding-left: 2.5mm; border-left: 0.15mm dotted var(--rule-soft); }
.inv-money .field { width: 100%; }
.inv-money .fvalue { min-height: 3.6mm; }
.tbl.inv tbody tr:last-child td { border-bottom: 0.15mm dotted var(--rule-soft); }

/* Kopf des Zauberblatts: Plätze, Punkte und Metamagie in einer Reihe */
.sp-top { column-span: all; break-inside: avoid; display: flex; flex-wrap: wrap;
          gap: 0 2.5mm; align-items: stretch; }
/* Der Vorrat wird mit der Zauberliste gelesen: bricht das Blatt, dann davor. Die Regel hängt an
   der Liste, nicht als break-after am Vorrat — sonst zöge ein Bogen ohne Zauber die gepinnten
   Merkmale mit. */
.sp-top + .sp-list { break-before: avoid; page-break-before: avoid; }
/* Plätze und Punkte sind so breit wie ihre Kreisreihe — mindestens aber so breit wie ihre
   Überschrift, was .block selbst regelt. Der Options-Pool nimmt den Rest. */
.sp-top > .block { flex: 0 1 auto; margin-bottom: 2mm;
                   display: flex; flex-direction: column; }
.sp-top > .sp-grow { flex: 1 1 60mm; }
/* Die Kästen stehen auf gleicher Höhe; die kurze Kreisreihe sitzt darin mittig. */
.sp-tight > .bbody { flex: 1; display: flex; flex-direction: column; justify-content: center; }
.sp-slots { display: flex; flex-wrap: wrap; gap: 1.2mm 3.5mm; }
.sp-slot, .sp-points { display: flex; flex-direction: column; gap: 0.4mm; }
.sp-points { flex-direction: row; align-items: baseline; gap: 1.5mm; flex-wrap: wrap; }
.sp-points + .sp-points { margin-top: 1mm; padding-top: 1mm; border-top: 0.15mm dotted var(--rule-soft); }
.sp-slot-lbl { font-size: 6pt; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-label); }

/* Zauber */
.cast-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 4mm;
             padding-bottom: 1mm; margin-bottom: 1.6mm; border-bottom: 0.25mm solid var(--rule-soft); }
.cast-val { font-size: 9pt; font-weight: 700; }
.cast-lbl { font-size: 6pt; font-weight: 400; text-transform: uppercase; letter-spacing: 0.06em;
            color: var(--ink-label); margin-right: 0.8mm; }
.spell-level { break-inside: avoid; }
.spell-level + .spell-level { margin-top: 1.6mm; }
.spell-level-head { display: flex; align-items: center; gap: 1.6mm; margin-bottom: 1mm; }
.lvl-badge { flex: 0 0 auto; width: 4.4mm; height: 5mm; background: var(--fill);
             clip-path: polygon(50% 0%, 100% 27%, 100% 73%, 50% 100%, 0% 73%, 0% 27%);
             display: flex; align-items: center; justify-content: center;
             font-size: 7pt; font-weight: 700; }
.lvl-name { flex: 1; border: 0.3mm solid var(--rule); border-radius: 3mm; padding: 0.3mm 2.4mm;
            font-size: 6.6pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; }
/* Die Spalten macht der Kasten selbst (.block.cols) — die Liste bleibt eine Bahn, damit
   Zaubergrade nicht quer über zwei Raster gelesen werden müssen. */
.spell { display: grid; grid-template-columns: auto 1fr; gap: 0 1.4mm; align-items: baseline;
         padding: 0.4mm 0 0.25mm; border-bottom: 0.15mm dotted var(--rule-soft); break-inside: avoid; }
.sname.write { min-height: 3.4mm; }
.lvl-note { text-transform: none; letter-spacing: 0; font-style: italic; }
.spell-note { grid-column: 2; font-size: 6pt; font-style: italic; color: var(--ink-label); }
.cast-note { font-size: 6.6pt; color: var(--ink-label); font-style: italic; margin-bottom: 1.4mm; }

${RULE_TEXT_PRINT_CSS}
.md { font-size: 8.2pt; }
`;
