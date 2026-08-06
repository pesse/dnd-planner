export type JobStatus = 'idle' | 'running' | 'done' | 'error' | 'skipped';

/**
 * Ein KI-Job: reaktiver Status, abbrechbar. Ein neuer `run()` bricht den vorigen ab; dessen
 * verspätetes Settle wird über das abgebrochene Signal verworfen.
 */
export class Job<T> {
  status = $state<JobStatus>('idle');
  result = $state<T | null>(null);
  error = $state('');
  #ctrl: AbortController | null = null;
  #running: Promise<unknown> = Promise.resolve();

  #begin(): AbortSignal {
    this.#ctrl?.abort();
    this.#ctrl = new AbortController();
    this.status = 'running';
    this.error = '';
    return this.#ctrl.signal;
  }

  /** Bewusst kein await — der Job läuft, während der Nutzer weiterarbeitet. */
  run(fn: (signal: AbortSignal) => Promise<T>): void {
    const signal = this.#begin();
    this.#running = fn(signal).then(
      (r) => { if (!signal.aborted) { this.result = r; this.status = 'done'; } },
      (e) => { if (!signal.aborted) { this.error = e instanceof Error ? e.message : String(e); this.status = 'error'; } },
    );
  }

  /** Nie rejektierend — der Zusammenbau soll an einem gescheiterten Job nicht hängenbleiben. */
  settle(): Promise<void> { return this.#running.then(() => {}, () => {}); }

  skip(): void { this.abort(); this.status = 'skipped'; }
  abort(): void { this.#ctrl?.abort(); this.#ctrl = null; }
  reset(): void { this.abort(); this.status = 'idle'; this.result = null; this.error = ''; }
}
