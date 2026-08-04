/**
 * Breite und Zuklapp-Zustand der Merkmalsleiste, gemerkt in `localStorage`.
 */
import { dragPanelWidth } from './panelResize';

const MIN_W = 240;
const MAX_W = 720;
const WIDTH_KEY = 'char-features-width';
const COLLAPSED_KEY = 'char-features-collapsed';

export interface FeaturePanelLayout {
  /** Zugeklappt 0 — die Leiste bleibt montiert und fährt auf null Breite. */
  readonly width: number;
  readonly collapsed: boolean;
  /** Während des Ziehens ist die Breiten-Transition abzuschalten. */
  readonly dragging: boolean;
  toggle(): void;
  startResize(e: MouseEvent): void;
}

export function createFeaturePanelLayout(): FeaturePanelLayout {
  let width = $state(parseInt(localStorage.getItem(WIDTH_KEY) ?? '360'));
  let collapsed = $state(localStorage.getItem(COLLAPSED_KEY) === '1');
  let dragging = $state(false);

  return {
    get width() { return collapsed ? 0 : width; },
    get collapsed() { return collapsed; },
    get dragging() { return dragging; },

    toggle() {
      collapsed = !collapsed;
      localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
    },

    startResize(e) {
      dragging = true;
      dragPanelWidth(e, {
        start: width,
        min: MIN_W,
        max: MAX_W,
        invert: true, // die Leiste hängt rechts — nach links ziehen vergrößert
        onWidth: (w) => { width = w; },
        ondone: () => {
          localStorage.setItem(WIDTH_KEY, String(width));
          dragging = false;
        },
      });
    },
  };
}
