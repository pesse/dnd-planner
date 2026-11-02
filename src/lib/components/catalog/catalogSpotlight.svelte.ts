import { tick } from 'svelte';
import type { CatalogRow } from '../../services/catalog/catalogTypes';
import type { GalleryImage } from './GallerySpotlight.svelte';

/** Stimmungsbilder vor Symbol; was nicht lädt, fällt weg. */
export function catalogImages(row: CatalogRow, failed: Record<string, true>): GalleryImage[] {
  const art = (row.art ?? []).map((url) => ({ url, art: true }));
  const icon = row.icon && !row.art?.includes(row.icon) ? [{ url: row.icon, art: false }] : [];
  return [...art, ...icon].filter((img) => !failed[img.url]);
}

const editable = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

/** Welcher Eintrag im `GallerySpotlight` steht, und woher sein Bild beim Öffnen herauswächst. */
export class CatalogSpotlight {
  /** Am Pfad statt am Index: ein Filterwechsel darf die Auswahl nicht auf einen anderen Eintrag schieben. */
  selected = $state<string | null>(null);
  origin = $state<DOMRect | null>(null);
  /** Das Element je Zeile, aus dem das Bild wächst und das nach dem Schließen den Fokus bekommt. */
  anchors: Record<string, HTMLElement> = {};
  private rows: () => CatalogRow[];
  private onopen: (row: CatalogRow) => void;
  private arrowsOpen: boolean;
  get index() {
    return this.selected ? this.rows().findIndex((r) => r.path === this.selected) : -1;
  }

  /** `arrowsOpen`: Pfeiltasten öffnen den Spotlight auch, wenn er zu ist. */
  constructor(rows: () => CatalogRow[], onopen: (row: CatalogRow) => void, arrowsOpen: boolean) {
    this.rows = rows;
    this.onopen = onopen;
    this.arrowsOpen = arrowsOpen;
  }

  show(row: CatalogRow, from: HTMLElement | null = this.anchors[row.path] ?? null) {
    this.origin = (from?.querySelector('.frame, img') ?? from)?.getBoundingClientRect() ?? null;
    this.selected = row.path;
  }

  async step(delta: number) {
    const rows = this.rows();
    if (!rows.length) return;
    const i = this.index;
    const row = rows[i < 0 ? (delta > 0 ? 0 : rows.length - 1) : (i + delta + rows.length) % rows.length];
    this.anchors[row.path]?.scrollIntoView({ block: 'nearest' });
    if (i < 0) {
      await tick();
      this.show(row);
    } else {
      this.origin = null;
      this.selected = row.path;
    }
  }

  close() {
    const path = this.selected;
    this.selected = null;
    if (path) this.anchors[path]?.focus({ preventScroll: true });
  }

  onkeydown = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || editable(e.target)) return;
    // Ein anderer Dialog (Vorschau, Anlegen) hat die Tastatur.
    if (document.querySelector('[role="dialog"]:not(.spotlight)')) return;
    const open = this.index >= 0;
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && (open || this.arrowsOpen)) {
      e.preventDefault();
      void this.step(e.key === 'ArrowRight' ? 1 : -1);
    } else if (open && e.key === 'Escape') {
      e.preventDefault();
      this.close();
    } else if (open && e.key === 'Enter') {
      e.preventDefault();
      this.onopen(this.rows()[this.index]);
    }
  };
}
