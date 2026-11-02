/** Die Bild-Fehlermarkierungen; sie gehören zum Rechner, nicht zum Vault, daher localStorage. */
import { get, writable } from 'svelte/store';
import { z } from 'zod';
import { imageMarkSchema, type ImageMark, type ImageMarkStatus } from '../schemas/imageMark';
import { imageFingerprint } from '../services/imageMarks/fingerprint';
import { pushNotice } from './toasts';

const STORAGE_KEY = 'image-marks';

function load(): ImageMark[] {
  try {
    const parsed = z.array(imageMarkSchema).safeParse(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export const imageMarks = writable<ImageMark[]>(load());
imageMarks.subscribe((list) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ohne Speicher gelten die Markierungen nur bis zum Neustart.
  }
});

export const imageMarksOpen = writable(false);

export const STATUS_LABELS: Record<ImageMarkStatus, string> = { open: 'offen', fixed: 'korrigiert' };

/** Was das Markieren über das Bild herausfindet; den Text gibt der Nutzer dazu. */
export type ImageMarkDraft = Omit<ImageMark, 'id' | 'createdAt' | 'status' | 'text'>;

export function addImageMark(mark: ImageMarkDraft & { text: string }): void {
  const full: ImageMark = { ...mark, id: crypto.randomUUID(), status: 'open', createdAt: new Date().toISOString() };
  imageMarks.update((list) => [...list, full]);
}

export function updateImageMark(id: string, patch: Partial<Pick<ImageMark, 'text' | 'status' | 'x' | 'y'>>): void {
  imageMarks.update((list) => list.map((m) => (m.id === id ? { ...m, ...patch } : m)));
}

export function removeImageMark(id: string): void {
  imageMarks.update((list) => list.filter((m) => m.id !== id));
}

export function clearImageMarks(): void {
  imageMarks.set([]);
}

/**
 * Hat sich die Datei hinter einer offenen Markierung geändert, gilt der Fehler als korrigiert.
 * Danach zählt die neue Fassung — wird der Status zurückgesetzt, löst erst die nächste Änderung aus.
 */
export async function recheckImageMarks(): Promise<number> {
  const changed = new Map<string, string>();
  for (const mark of get(imageMarks)) {
    if (!mark.url || !mark.fingerprint) continue;
    const now = await imageFingerprint(mark.url);
    if (now && now !== mark.fingerprint) changed.set(mark.id, now);
  }
  if (changed.size === 0) return 0;
  let fixed = 0;
  imageMarks.update((list) =>
    list.map((m) => {
      const fingerprint = changed.get(m.id);
      if (!fingerprint) return m;
      if (m.status === 'open') fixed++;
      return { ...m, fingerprint, status: 'fixed' };
    }),
  );
  return fixed;
}

/** Nach einem Inhalts-Update und beim Start: meldet sich nur, wenn sich wirklich etwas geändert hat. */
export async function announceFixedImageMarks(): Promise<void> {
  const fixed = await recheckImageMarks();
  if (fixed > 0) {
    pushNotice(`${fixed} Bild-Fehlermarkierung(en) als korrigiert erkannt — das Bild wurde erneuert.`, {
      label: 'Übersicht öffnen',
      run: () => imageMarksOpen.set(true),
    });
  }
}

const percent = (v: number) => `${(v * 100).toFixed(1)} %`;

export function imageMarksText(list: ImageMark[]): string {
  return list
    .map((m, i) =>
      [
        `${i + 1}. [${STATUS_LABELS[m.status]}] ${m.address}`,
        `   Position: x ${percent(m.x)}, y ${percent(m.y)}` +
          (m.width && m.height ? ` (Pixel ${Math.round(m.x * m.width)}, ${Math.round(m.y * m.height)} von ${m.width}×${m.height})` : ''),
        `   Ort: ${m.where}`,
        `   ${m.text.trim().replace(/\n/g, '\n   ') || '(ohne Beschreibung)'}`,
      ].join('\n'),
    )
    .join('\n\n');
}
