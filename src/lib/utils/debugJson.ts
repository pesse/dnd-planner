/**
 * Entschachtelt JSON, das als String in JSON steckt (Tool-Call-`arguments`,
 * Tool-Ergebnisse, structured output) — sonst zeigt die Debug-Ansicht `"{\"q\":1}"`.
 */

const MAX_DEPTH = 8;

/**
 * Jeder String, der sich zu Objekt/Array parsen lässt, wird ersetzt; Primitive-Strings
 * ("42", "true") bleiben, sonst würden Werte uminterpretiert. Baut nur neue Strukturen —
 * der Debug-Store ist live und darf nicht mutiert werden.
 */
export function reviveJson(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return value;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed !== null && typeof parsed === 'object') {
          return reviveJson(parsed, depth + 1);
        }
      } catch {
        /* kein JSON → String unverändert lassen */
      }
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((v) => reviveJson(v, depth + 1));
  }

  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = reviveJson(v, depth + 1);
    }
    return out;
  }

  return value;
}

export function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(reviveJson(value), null, 2);
  } catch {
    // Zirkuläre Referenzen o. Ä. — best effort ohne revive.
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
}
