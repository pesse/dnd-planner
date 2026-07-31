/**
 * Serialisierung in den Vault. Die Herkunft hängt nicht am Artefakt, sondern an
 * seinem Ablageort:
 *
 *   akt-lokal (campaigns/*​/acts/*​/monsters/)  → KEIN `source`
 *   Bibliothek (vault/monsters/, spells/, …)  → genau ein gültiger `source`
 *
 * Akt-lokales Material wird nie als Bibliothek verteilt, sondern nur mit seiner
 * Kampagne — die Herkunftsfrage stellt sich dort nicht. Erst die Übernahme in die
 * Bibliothek vergibt eine. Siehe vault/CLAUDE.md.
 */
import { toSourceKey } from '../schemas/source';

/** Akt-lokales Artefakt: ohne Herkunft ablegen. */
export function toActLocalJson(entity: unknown): string {
  const obj = { ...(entity as Record<string, unknown>) };
  delete obj.source;
  return JSON.stringify(obj, null, 2);
}

/**
 * Bibliotheks-Artefakt: mit gültiger Herkunft ablegen.
 *
 * Setzt `source` an Ort und Stelle (Feldreihenfolge bleibt erhalten) und
 * normalisiert dabei Altwerte. Wer eine bestimmte Herkunft erzwingen will —
 * etwa die Übernahme aus einem Akt — übergibt sie mitsamt dem Artefakt.
 */
export function toLibraryJson(entity: unknown): string {
  const obj = { ...(entity as Record<string, unknown>) };
  obj.source = toSourceKey(obj.source as string);
  return JSON.stringify(obj, null, 2);
}
