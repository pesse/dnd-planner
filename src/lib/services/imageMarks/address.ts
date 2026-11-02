/** Welches Bild an einer Bildschirmstelle liegt, unter welcher Adresse, und wo darin geklickt wurde. */

/**
 * `convertFileSrc` kodiert den absoluten Pfad in die URL (`http://asset.localhost/C%3A%5C…`), der
 * Browser-Dev liefert `vault/art` unter `/art`. Beides wird zum Vault-relativen Pfad, der zwischen
 * Release- und Dev-Vault gleich bleibt.
 */
export function imageAddress(url: string): string {
  if (url.startsWith('data:')) return `eingebettetes Bild (${url.slice(5, url.indexOf(';'))})`;
  let parsed: URL;
  try {
    parsed = new URL(url, 'http://app.local');
  } catch {
    return url;
  }
  const path = decodeURIComponent(parsed.pathname).replace(/\\/g, '/');
  const vault = path.indexOf('/vault/');
  if (vault >= 0) return path.slice(vault + 1);
  if (path.startsWith('/art/')) return `vault${path}`;
  if (parsed.host === 'app.local' || parsed.host.startsWith('localhost') || parsed.host === 'tauri.localhost') {
    return `static${path}`;
  }
  return `${parsed.origin}${path}`;
}

export interface ImageBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ImageFit {
  /** `object-fit` bzw. aus `background-size` abgeleitet. */
  fit: string;
  /** `object-position` / `background-position`, z. B. `38% center`. */
  position: string;
  flipX: boolean;
}

const KEYWORD: Record<string, number> = { left: 0, top: 0, center: 0.5, right: 1, bottom: 1 };

/** Versatz des Bilds im Rahmen entlang einer Achse; `free` = Rahmen minus Bildgröße. */
function offset(token: string | undefined, free: number): number {
  if (!token) return free / 2;
  if (token in KEYWORD) return free * KEYWORD[token];
  if (token.endsWith('%')) return (free * parseFloat(token)) / 100;
  if (token.endsWith('px')) return parseFloat(token);
  return free / 2;
}

function positionTokens(position: string): [string | undefined, string | undefined] {
  const t = position.trim().split(/\s+/);
  // `top`/`bottom` allein oder vorn beziehen sich auf die y-Achse.
  if (t[0] === 'top' || t[0] === 'bottom') return [t[1], t[0]];
  return [t[0], t[1]];
}

/** Klickpunkt auf dem Bildschirm → Anteile an der Bilddatei, jeweils 0…1. */
export function pointOnImage(
  box: ImageBox,
  natural: { width: number; height: number },
  { fit, position, flipX }: ImageFit,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  let w = box.width;
  let h = box.height;
  if (natural.width > 0 && natural.height > 0 && fit !== 'fill') {
    const contain = Math.min(box.width / natural.width, box.height / natural.height);
    const scale =
      fit === 'cover' ? Math.max(box.width / natural.width, box.height / natural.height)
        : fit === 'contain' ? contain
          : fit === 'scale-down' ? Math.min(1, contain)
            : 1;
    w = natural.width * scale;
    h = natural.height * scale;
  }
  const [px, py] = positionTokens(position);
  const left = box.left + offset(px, box.width - w);
  const top = box.top + offset(py, box.height - h);
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const x = clamp((clientX - left) / w);
  return { x: flipX ? 1 - x : x, y: clamp((clientY - top) / h) };
}

/** `background-size` in `object-fit`-Begriffen; andere Angaben werden als gestreckt behandelt. */
export const fitOfBackgroundSize = (size: string): string =>
  size === 'cover' || size === 'contain' ? size : size === 'auto' || size === 'auto auto' ? 'none' : 'fill';
