/** Bibliotheksbild im Rahmen für die Druckdokumente; Größe und Lage setzt der Aufrufer an `.print-art`. */

// Fehlt das Bild (eigene Einträge), räumt es sich selbst ab, statt ein kaputtes Symbol zu drucken.
export const printArtHtml = (url: string | null): string =>
  url ? `<div class="print-art"><img src="${url}" alt="" onerror="this.parentElement.remove()"></div>` : '';

/** Hintergrund aus `--c`. */
export const PRINT_ART_CSS = `
.print-art {
  box-sizing: border-box; padding: 0.5mm;
  border: 0.25mm solid #9a7a3a; border-radius: 1.5mm;
  background: radial-gradient(circle at 50% 42%,
    color-mix(in srgb, var(--c) 35%, white) 0%,
    color-mix(in srgb, var(--c) 75%, white) 55%,
    var(--c) 100%);
  box-shadow: inset 0 0 0 0.35mm #fef8ec;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.print-art img { display: block; width: 100%; height: 100%; }
`;
