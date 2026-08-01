/**
 * Serialisierung in den Vault: die Herkunft hängt am Ablageort, nicht am Artefakt.
 * Akt-lokales Material wird nur mit seiner Kampagne verteilt und trägt deshalb KEIN
 * `source` — erst die Übernahme in die Bibliothek vergibt eines (vault/CLAUDE.md).
 */
import { toSourceKey } from '../schemas/source';

export function toActLocalJson(entity: unknown): string {
  const obj = { ...(entity as Record<string, unknown>) };
  delete obj.source;
  return JSON.stringify(obj, null, 2);
}

/**
 * Setzt `source` an Ort und Stelle (Feldreihenfolge bleibt erhalten) und normalisiert
 * dabei Altwerte. Eine bestimmte Herkunft erzwingt man über das Artefakt selbst.
 */
export function toLibraryJson(entity: unknown): string {
  const obj = { ...(entity as Record<string, unknown>) };
  obj.source = toSourceKey(obj.source as string);
  return JSON.stringify(obj, null, 2);
}
