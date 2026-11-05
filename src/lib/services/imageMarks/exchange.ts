/** Bilder und Markierungen über Zwischenablage und Datei aus der App heraus und wieder hinein. */
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import encodeAvif from '@jsquash/avif/encode';
import { isTauri } from '../httpFetch';
import type { ImageMark } from '../../schemas/imageMark';

/** Die Zwischenablage nimmt nur PNG; AVIF wird deshalb über ein Canvas umkodiert. */
export async function copyImageToClipboard(url: string): Promise<void> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Bild nicht lesbar (${res.status})`);
  const bitmap = await createImageBitmap(await res.blob());
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  const png = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG-Umwandlung fehlgeschlagen'))), 'image/png'),
  );
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
}

/** Dieselben Felder, die `importImageMarks` liest. */
export const imageMarksJson = (list: ImageMark[]): string =>
  JSON.stringify(
    list.map(({ address, where, x, y, width, height, text }) => ({ address, where, x, y, width, height, text })),
    null,
    1,
  );

/** false, wenn der Speichern-Dialog abgebrochen wurde. */
export async function exportImageMarks(list: ImageMark[]): Promise<boolean> {
  const name = `bild-markierungen-${new Date().toISOString().slice(0, 10)}.json`;
  const content = imageMarksJson(list);
  if (isTauri()) {
    const path = await save({ defaultPath: name, filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (!path) return false;
    await invoke('write_file_content', { path, content });
    return true;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
  return true;
}

/** Ersetzbar ist nur, was im Vault unter `art/` liegt — und nur in der Desktop-App, die Dateien schreiben kann. */
export const replaceableArt = (address: string): boolean => isTauri() && /^vault\/art\/.+\.avif$/.test(address);

async function clipboardImage(): Promise<Blob> {
  for (const item of await navigator.clipboard.read()) {
    const type = item.types.find((t) => t.startsWith('image/'));
    if (type) return item.getType(type);
  }
  throw new Error('In der Zwischenablage ist kein Bild');
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * Schreibt das Bild aus der Zwischenablage über die Vault-Datei, auf deren Pixelmaß zugeschnitten
 * (mittig, wie `object-fit: cover`) und mit derselben AVIF-Qualität wie die Bild-Pipeline (q55).
 */
export async function replaceArtFromClipboard(address: string, width: number, height: number): Promise<void> {
  const bitmap = await createImageBitmap(await clipboardImage());
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const scale = Math.max(width / bitmap.width, height / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (width - w) / 2, (height - h) / 2, w, h);
  const avif = await encodeAvif(ctx.getImageData(0, 0, width, height), { quality: 55 });
  await invoke('write_file_base64', { path: `./${address}`, data: toBase64(new Uint8Array(avif)) });
}
