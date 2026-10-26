/** Portrait-Aufträge je Charakter-Ordner — sie überleben Tabwechsel und das Neuaufbauen des Formulars. */
import type { ReadyProvider } from './providers';
import type { GeneratedImage } from './types';

export interface PortraitJob {
  busy: boolean;
  result: GeneratedImage | null;
  /** Die Figur mit dem Gesicht aus `result` oder dem gespeicherten Portrait. */
  figure: GeneratedImage | null;
  error: string;
  /** Der Dialog ist zu, der Auftrag läuft weiter oder wartet mit seinem Ergebnis. */
  minimized: boolean;
}

// Map statt $state-Record: der Komponenten-$derived legt Einträge an, und das darf keinen Effekt auslösen.
const jobs = new Map<string, PortraitJob>();

export function portraitJob(dirPath: string): PortraitJob {
  const known = jobs.get(dirPath);
  if (known) return known;
  const job: PortraitJob = $state({ busy: false, result: null, figure: null, error: '', minimized: false });
  jobs.set(dirPath, job);
  return job;
}

// Außerhalb des $state-Objekts: ein AbortController gehört nicht in den Proxy.
const running = new WeakMap<PortraitJob, AbortController>();

async function track(
  job: PortraitJob, failure: string, work: (signal: AbortSignal) => Promise<GeneratedImage>,
  done: (image: GeneratedImage) => void,
): Promise<void> {
  const controller = new AbortController();
  running.set(job, controller);
  job.error = '';
  job.busy = true;
  try {
    const image = await work(controller.signal);
    // Nicht jeder Anbieter hört auf das Signal — ein Bild, das trotzdem kommt, verfällt.
    if (!controller.signal.aborted) done(image);
  } catch (e) {
    if (!controller.signal.aborted) job.error = `${failure}: ${e instanceof Error ? e.message : e}`;
  } finally {
    if (running.get(job) === controller) {
      running.delete(job);
      job.busy = false;
    }
  }
}

/** Ein schon begonnenes Bild rechnet der Anbieter womöglich trotzdem ab. */
export function cancelJob(job: PortraitJob): void {
  running.get(job)?.abort();
  running.delete(job);
  job.busy = false;
}

export const generatePortrait = (job: PortraitJob, ready: ReadyProvider, prompt: string): Promise<void> =>
  track(job, 'Bild konnte nicht erzeugt werden', (signal) => ready.generate(prompt, { signal }),
    (image) => { job.result = image; });

export const generateFigure = (job: PortraitJob, make: (signal: AbortSignal) => Promise<GeneratedImage>): Promise<void> =>
  track(job, 'Figur konnte nicht erzeugt werden', make, (image) => { job.figure = image; });

export function discardPortrait(job: PortraitJob): void {
  job.minimized = false;
  job.result = null;
  job.figure = null;
  job.error = '';
}
