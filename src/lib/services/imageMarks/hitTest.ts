/** Das Bild unter dem Mauszeiger — als `<img>` oder als CSS-Hintergrundbild. */
import { fitOfBackgroundSize, pointOnImage, type ImageFit } from './address';

export interface ImageHit {
  url: string;
  element: Element;
  width: number;
  height: number;
  fit: ImageFit;
}

const BG_URL = /url\(["']?([^"')]+)["']?\)/;

function flipped(style: CSSStyleDeclaration): boolean {
  if (!style.transform || style.transform === 'none') return false;
  return new DOMMatrixReadOnly(style.transform).a < 0;
}

function imgHit(img: HTMLImageElement): ImageHit | null {
  if (!img.currentSrc && !img.src) return null;
  const style = getComputedStyle(img);
  return {
    url: img.currentSrc || img.src,
    element: img,
    width: img.naturalWidth,
    height: img.naturalHeight,
    fit: { fit: style.objectFit || 'fill', position: style.objectPosition || '50% 50%', flipX: flipped(style) },
  };
}

function backgroundUrl(el: Element): string | null {
  const bg = getComputedStyle(el).backgroundImage;
  return bg && bg !== 'none' ? (BG_URL.exec(bg)?.[1] ?? null) : null;
}

async function backgroundHit(el: Element, url: string): Promise<ImageHit> {
  const style = getComputedStyle(el);
  const probe = new Image();
  probe.src = url;
  await probe.decode().catch(() => {});
  return {
    url: probe.src,
    element: el,
    width: probe.naturalWidth,
    height: probe.naturalHeight,
    fit: { fit: fitOfBackgroundSize(style.backgroundSize), position: style.backgroundPosition, flipX: flipped(style) },
  };
}

const visible = (el: Element): boolean => {
  const s = getComputedStyle(el);
  return s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity) > 0;
};

/**
 * Bilder mit `pointer-events: none` liefert `elementsFromPoint` nicht; dann gewinnt unter allen
 * Bildern an der Stelle das kleinste, denn ein Vorschaubild liegt über seiner Kulisse.
 */
function hiddenImgAt(x: number, y: number, skip: Element | null): HTMLImageElement | null {
  let best: HTMLImageElement | null = null;
  let bestArea = Infinity;
  for (const img of Array.from(document.images)) {
    if (skip?.contains(img)) continue;
    const r = img.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom || !visible(img)) continue;
    if (r.width * r.height < bestArea) {
      best = img;
      bestArea = r.width * r.height;
    }
  }
  return best;
}

/** `skip` blendet die eigene Markier-Oberfläche aus. */
export async function imageAt(x: number, y: number, skip: Element | null): Promise<ImageHit | null> {
  for (const el of document.elementsFromPoint(x, y)) {
    if (skip?.contains(el)) continue;
    if (el instanceof HTMLImageElement) return imgHit(el);
    const bg = backgroundUrl(el);
    if (bg) return backgroundHit(el, bg);
  }
  const img = hiddenImgAt(x, y, skip);
  return img ? imgHit(img) : null;
}

export function hitPoint(hit: ImageHit, clientX: number, clientY: number): { x: number; y: number } {
  return pointOnImage(hit.element.getBoundingClientRect(), hit, hit.fit, clientX, clientY);
}
