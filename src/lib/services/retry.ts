import { logDebug } from '../stores/debug';
import { pushRateLimitWait, clearRateLimitWait } from '../stores/rateLimit';

/**
 * Rate-Limit-Erkennung + Backoff für die portablen HTTP-Provider.
 *
 * Hintergrund: schnelle Provider (z.B. Groq) laufen bei großen Kontexten in
 * Tokens-per-Minute-Limits und antworten mit `HTTP 429` plus einer Meldung wie
 * `Please try again in 12.475s`. Statt den Fehler durchzureichen, warten wir die
 * angegebene (bzw. eine exponentiell wachsende) Zeit ab und versuchen es erneut.
 *
 * Anthropic braucht das nicht — dessen SDK macht 429/5xx-Retries selbst.
 */

export interface RetryOptions {
  /** Maximale Anzahl an Wiederholungen (zusätzlich zum ersten Versuch). Default: 5. */
  maxRetries?: number;
  /** Abbruch-Signal: bricht auch die Wartephase sofort ab. */
  signal?: AbortSignal;
  /** Callback vor jeder Wartephase — z.B. um die UI am Leben zu halten. */
  onWait?: (info: { waitMs: number; attempt: number; fromServer: boolean }) => void;
  /** Provider-Name für Debug-Logs. */
  provider?: string;
}

/** True, wenn die Fehlermeldung ein Rate-Limit (HTTP 429) signalisiert. */
export function isRateLimitError(message: string): boolean {
  return /\bHTTP 429\b/.test(message) || /\b429\b/.test(message) || /rate.?limit/i.test(message);
}

/**
 * Parst die vom Server vorgeschlagene Wartezeit (in ms) aus einer 429-Meldung.
 * Erkennt das Groq/OpenAI-Format `try again in 12.475s` sowie `…in 90ms`,
 * `…in 1m30s` und `retry-after: 12`-Hinweise. `null` = nicht erkennbar.
 */
export function parseRetryDelayMs(message: string): number | null {
  // "try again in 90ms"
  const ms = message.match(/try again in\s+([\d.]+)\s*ms/i);
  if (ms) return Math.ceil(parseFloat(ms[1]));

  // "try again in 1m30s" / "try again in 12.475s" / "try again in 2m"
  const composite = message.match(/try again in\s+(?:(\d+)\s*m)?\s*(?:([\d.]+)\s*s)?/i);
  if (composite && (composite[1] || composite[2])) {
    const minutes = composite[1] ? parseInt(composite[1], 10) : 0;
    const seconds = composite[2] ? parseFloat(composite[2]) : 0;
    const total = minutes * 60 + seconds;
    if (total > 0) return Math.ceil(total * 1000);
  }

  // "retry-after: 12" (Sekunden) — Header-Wert, falls er im Body auftaucht
  const retryAfter = message.match(/retry[-\s]?after["']?\s*[:=]?\s*([\d.]+)/i);
  if (retryAfter) return Math.ceil(parseFloat(retryAfter[1]) * 1000);

  return null;
}

/** Warten, das sich über das Abbruch-Signal sofort beenden lässt. */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Abgebrochen.'));
    const cleanup = () => {
      clearTimeout(id);
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new Error('Abgebrochen.'));
    };
    const id = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort);
  });
}

/**
 * Führt `fn` aus und wiederholt bei Rate-Limit-Fehlern (HTTP 429), nachdem die
 * vom Server genannte Wartezeit (oder ein exponentieller Backoff) abgewartet
 * wurde. Andere Fehler werden unverändert durchgereicht.
 */
export async function withRateLimitRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxRetries = opts.maxRetries ?? 5;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!isRateLimitError(msg) || attempt >= maxRetries) throw e;

      const fromServer = parseRetryDelayMs(msg);
      // Exponentieller Fallback: 2s, 4s, 8s, … gedeckelt bei 60s.
      const backoff = Math.min(2000 * 2 ** attempt, 60_000);
      // +500ms Puffer auf die Server-Angabe, damit das Fenster sicher offen ist.
      const waitMs = fromServer != null ? fromServer + 500 : backoff;

      const provider = opts.provider ?? 'llm';
      logDebug({
        provider,
        type: 'error',
        label: 'rate-limit',
        data: {
          note: `Rate-Limit (429) — warte ${(waitMs / 1000).toFixed(1)}s und versuche erneut (Versuch ${attempt + 1}/${maxRetries})`,
          fromServer: fromServer != null,
        },
      });
      opts.onWait?.({ waitMs, attempt: attempt + 1, fromServer: fromServer != null });

      // Globaler, für alle LLM-Pfade einheitlicher Hinweis (Toast) während der Wartezeit.
      const waitId = pushRateLimitWait({ provider, waitMs, attempt: attempt + 1 });
      try {
        await delay(waitMs, opts.signal);
      } finally {
        clearRateLimitWait(waitId);
      }
    }
  }
}
