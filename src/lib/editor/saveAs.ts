import { promptDialog } from '$lib/stores/promptDialog';

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
}

export interface SaveAsResult {
  name: string;
  bucket?: string;
}

const channel = promptDialog<SaveAsRequest, SaveAsResult | null>();

/** Treibt den SaveAsDialog. Null = kein Dialog offen. */
export const saveAsPrompt = channel.prompt;

/** Öffnet den Save-as-Dialog und liefert die Auswahl (oder null bei Abbruch). */
export const openSaveAs = channel.ask;
