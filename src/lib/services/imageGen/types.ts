/** Gemeinsame Form der Bild-Anbieter; jeder liefert ein fertiges Bild als Base64. */
import type { HelpTopicId } from '../../help/topics';

export interface GeneratedImage {
  b64: string;
  ext: 'png' | 'jpg';
  /** Verbrauch in der Einheit des Anbieters, z. B. `{ neurons: 104.2 }` — nur fürs Debug-Log. */
  usage?: Record<string, number>;
}

export interface ReferenceImage { blob: Blob; width: number; height: number; }

export interface ImageOptions {
  width?: number;
  height?: number;
  /** In Prompt-Reihenfolge: „image 1" ist das erste. */
  references?: ReferenceImage[];
  signal?: AbortSignal;
}

export interface SettingField {
  key: string;
  label: string;
  placeholder: string;
  /** Mit Default ist das Feld optional. */
  default?: string;
}

export interface ImageProvider {
  id: string;
  label: string;
  fields: SettingField[];
  /** Service-Name im OS-Keychain; ohne `secret` braucht der Anbieter keinen Token. */
  secret?: { keychain: string; placeholder: string };
  /** Längere Prompts lehnt die API ab; ohne Wert gibt es keine Grenze. */
  maxPromptChars?: number;
  /** Versteht deutsche Prompts selbst — dann braucht es keine Übersetzung vorab. */
  understandsGerman?: boolean;
  /** Anleitung zum Einrichten des Zugangs. */
  help?: HelpTopicId;
  /** Ohne Wert nimmt der Anbieter keine Referenzbilder, `ImageOptions.references` fällt weg. */
  maxReferences?: number;
  /** Was `generate` abschickt — das Debug-Log zeigt genau das, ohne Token und ohne Bilddaten. */
  request(settings: Record<string, string>, prompt: string, options?: ImageOptions): ImageRequest;
  generate(
    settings: Record<string, string>, secret: string | null, prompt: string, options?: ImageOptions,
  ): Promise<GeneratedImage>;
}

export interface ImageRequest {
  url: string;
  body: Record<string, string | number>;
  /** Je Referenzbild Feldname und Maße, die Bytes gehen nur in den Request. */
  references?: string[];
}
