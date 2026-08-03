/*
 * Svelte-Action für die Autocomplete-Listen (`.suggestions`): legt die Liste unter oder über
 * das Eingabefeld, je nachdem wo Platz ist, und begrenzt ihre Höhe auf den Rest.
 *
 * Sie wird dazu auf `position: fixed` umgestellt und am Anker-Rechteck ausgerichtet.
 * Absolut positioniert bliebe sie im nächsten klippenden Vorfahren gefangen — der
 * Talent-Picker sitzt in `.ref-block { overflow: hidden }` der Merkmals-Seitenleiste, die
 * übrigen in scrollenden Panels, deren Kanten oft nur ein bis zwei Zeilen entfernt sind.
 * Umklappen allein würde die Liste dann nur an der anderen Kante abschneiden.
 *
 * Voraussetzung ist die vorhandene Struktur — `.autocomplete-wrap` als direktes Elternelement
 * der Liste. Kein Vorfahre darf `transform`/`filter`/`will-change` tragen, sonst wird er
 * wieder zum Bezugsrahmen und klippt erneut.
 */

/** Abstand zum Fensterrand, damit die Liste nicht bündig anstößt. */
const MARGIN = 4;

/**
 * Sichtbarer vertikaler Bereich für `node`: Viewport, geschnitten mit jedem Vorfahren, der
 * überhaupt klippt. Für die Platzierung selbst irrelevant (die ist fixed), aber die Liste
 * soll verschwinden, sobald ihr Eingabefeld aus dem Panel herausgescrollt ist — sonst
 * schwebte sie über fremdem Inhalt weiter.
 */
function clipBounds(node: HTMLElement): { top: number; bottom: number } {
  let top = 0;
  let bottom = window.innerHeight;
  for (let el = node.parentElement; el; el = el.parentElement) {
    if (getComputedStyle(el).overflowY === 'visible') continue;
    const r = el.getBoundingClientRect();
    top = Math.max(top, r.top);
    bottom = Math.min(bottom, r.bottom);
  }
  return { top, bottom };
}

export function dropdownPlacement(node: HTMLElement) {
  const anchor = node.parentElement;
  // Einmal vor dem ersten Überschreiben merken. Die Wunschhöhe kommt später aus
  // `scrollHeight` (Inhalt + Padding) statt aus `offsetHeight`: sonst müsste `max-height` zum
  // Messen zurückgesetzt werden, was den ResizeObserver unten erneut auslöst.
  const cs = getComputedStyle(node);
  const cssMax = parseFloat(cs.maxHeight);
  const naturalMax = Number.isFinite(cssMax) ? cssMax : Infinity;
  const borders = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);

  const place = () => {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const clip = clipBounds(anchor);
    node.style.visibility = rect.bottom < clip.top || rect.top > clip.bottom ? 'hidden' : '';

    const below = window.innerHeight - rect.bottom - MARGIN;
    const above = rect.top - MARGIN;
    const wanted = Math.min(node.scrollHeight + borders, naturalMax);
    const up = below < wanted && above > below;

    node.style.position = 'fixed';
    node.style.left = `${rect.left}px`;
    node.style.right = 'auto';
    node.style.width = `${rect.width}px`;
    node.style.maxHeight = `${Math.max(0, Math.min(naturalMax, up ? above : below))}px`;
    node.style.top = up ? 'auto' : `${rect.bottom}px`;
    node.style.bottom = up ? `${window.innerHeight - rect.top}px` : 'auto';
  };

  place();
  // Die Trefferliste wächst und schrumpft beim Tippen, das Feld wandert beim Scrollen.
  const ro = new ResizeObserver(place);
  ro.observe(node);
  window.addEventListener('scroll', place, true);
  window.addEventListener('resize', place);

  return {
    destroy: () => {
      ro.disconnect();
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    },
  };
}
