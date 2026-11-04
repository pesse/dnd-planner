/**
 * Breite und Zuklapp-Zustand einer Seitenleiste, gemerkt in `localStorage` unter `<key>-width`/`<key>-collapsed`.
 */
import { dragPanelWidth } from './panelResize';

export interface PanelLayout {
  /** Zugeklappt 0 — die Leiste bleibt montiert und fährt auf null Breite. */
  readonly width: number;
  readonly collapsed: boolean;
  /** Während des Ziehens ist die Breiten-Transition abzuschalten. */
  readonly dragging: boolean;
  toggle(): void;
  startResize(e: MouseEvent): void;
}

export function createPanelLayout(o: {
  key: string;
  min: number;
  max: number;
  initial: number;
  /** An welchem Rand die Leiste hängt; rechts vergrößert Ziehen nach links. */
  side: 'left' | 'right';
}): PanelLayout {
  const read = (k: string) => {
    try {
      return localStorage.getItem(`${o.key}-${k}`);
    } catch {
      return null;
    }
  };
  const write = (k: string, v: string) => {
    try {
      localStorage.setItem(`${o.key}-${k}`, v);
    } catch {
      /* ohne Speicher gilt die Wahl nur bis zum Neuladen */
    }
  };

  let width = $state(Math.max(o.min, Math.min(o.max, parseInt(read('width') ?? '') || o.initial)));
  let collapsed = $state(read('collapsed') === '1');
  let dragging = $state(false);

  return {
    get width() { return collapsed ? 0 : width; },
    get collapsed() { return collapsed; },
    get dragging() { return dragging; },

    toggle() {
      collapsed = !collapsed;
      write('collapsed', collapsed ? '1' : '0');
    },

    startResize(e) {
      dragging = true;
      dragPanelWidth(e, {
        start: width,
        min: o.min,
        max: o.max,
        invert: o.side === 'right',
        onWidth: (w) => { width = w; },
        ondone: () => {
          write('width', String(width));
          dragging = false;
        },
      });
    },
  };
}
