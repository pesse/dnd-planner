import { writable } from 'svelte/store';

/** Wählbarer Ablageort im Save-as-Dialog (z.B. Schule, Kategorie, Akt). */
export interface SaveAsBucket {
  value: string;
  label: string;
}

export interface SaveAsRequest {
  /** Vorbelegter Name (noch nicht slugged). */
  name: string;
  /** Beschriftung des Bucket-Selektors ("Schule"/"Kategorie"/…). Fehlt → kein Selektor. */
  bucketLabel?: string;
  buckets: SaveAsBucket[];
  /** Vorausgewählter Bucket. */
  bucket?: string;
  resolve: (result: { name: string; bucket?: string } | null) => void;
}

/** Treibt den SaveAsDialog. Null = kein Dialog offen. */
export const saveAsPrompt = writable<SaveAsRequest | null>(null);

/** Öffnet den Save-as-Dialog und liefert die Auswahl (oder null bei Abbruch). */
export function openSaveAs(
  req: Omit<SaveAsRequest, 'resolve'>,
): Promise<{ name: string; bucket?: string } | null> {
  return new Promise((resolve) => {
    saveAsPrompt.set({ ...req, resolve });
  });
}

/** Datei-/Slug-freundliche Form eines Namens (gemeinsam für alle Editoren). */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-äöüß]/g, '');
}
