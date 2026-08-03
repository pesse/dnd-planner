/**
 * Was Transport UND Mapper von Open5e brauchen. Eigenes Modul, damit die Mapper
 * `invoke`-frei bleiben — der Node-Importer bündelt sie direkt.
 */

export const OPEN5E_V2 = 'https://api.open5e.com/v2';

/** Standard-Quelle: SRD 5.2 (passt zur deutschen 5.2.1-Terminologie der App). */
export const DEFAULT_DOCUMENT = 'srd-2024';

export const capitalize = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Einzeiliger `desc`-String → Absatz-Array; Array wird durchgereicht. */
export function descToParagraphs(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string' && raw.trim()) return raw.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
  return [];
}
