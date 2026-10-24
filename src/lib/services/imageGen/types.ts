/** Gemeinsame Form der Bild-Anbieter; jeder liefert ein fertiges Bild als Base64. */
export interface GeneratedImage { b64: string; ext: 'png' | 'jpg'; }

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
  generate(settings: Record<string, string>, secret: string | null, prompt: string): Promise<GeneratedImage>;
}
