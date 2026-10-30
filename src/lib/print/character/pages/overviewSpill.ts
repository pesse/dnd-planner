/**
 * Passt die linke Spalte der Übersicht nicht aufs Blatt, wandern ihre Kästen von unten her auf
 * die nächste Seite, vor „Persönliches" & Co. Der Angriffskasten bleibt so immer auf Blatt 1.
 */
import { esc } from '../html';

/** Auffangseite, falls keine Folgeseite gewählt ist; bleibt sonst verborgen. */
export const spillPage = (name: string): string =>
  `<div class="page o-spill" hidden><div class="page-head">${esc(name)}</div></div>`;

// Läuft im Druck-Iframe, nach dem Satz: nur dort steht die Höhe fest. Ein zweiter Lauf, wenn die
// Schriften da sind — mit Ersatzschrift misst die Spalte anders. Er schiebt nur, was noch drüber ist.
export const SPILL_SCRIPT = `(() => {
  const run = () => {
    const sheet = document.querySelector('.sheet');
    const extra = sheet && sheet.querySelector('.o-extra');
    if (!extra) return;
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;height:285mm';
    document.body.appendChild(probe);
    const limit = probe.getBoundingClientRect().height + 1;
    probe.remove();
    const moved = [];
    while (sheet.getBoundingClientRect().height > limit && extra.lastElementChild) {
      moved.unshift(extra.removeChild(extra.lastElementChild));
    }
    if (!moved.length) return;
    let page = Array.from(document.querySelectorAll('.page')).find((p) => !p.classList.contains('o-spill'));
    if (!page) { page = document.querySelector('.o-spill'); page.hidden = false; }
    // Was ein zweiter Lauf schiebt, stand in der Spalte ÜBER dem schon Gewanderten.
    const head = page.querySelector('.page-head');
    const before = page.querySelector('.o-spilled') || (head ? head.nextSibling : page.firstChild);
    for (const el of moved) {
      el.classList.add('o-spilled');
      page.insertBefore(el, before);
    }
  };
  run();
  if (document.fonts) document.fonts.ready.then(run);
})();`;
