/**
 * Generischer Eval-Harness für die Prompt-Qualität der KI-Actions.
 *
 * Idee: Eine Action wird mit einem definierten Input N-mal gegen einen echten
 * LLM-Call ausgeführt; jeder Lauf wird gegen eine Liste von Assertions geprüft.
 * Weil LLM-Antworten nicht deterministisch sind, zählt die **Pass-Rate** über N
 * Läufe, nicht ein einzelnes Ergebnis. So lässt sich messen, ob ein gekürzter
 * Prompt die Qualität hält (`compareVariants`).
 *
 * Der Netzwerk-Transport läuft über den echten Produktionspfad (`runAiAction`);
 * außerhalb von Tauri fällt `httpFetch` auf das globale `fetch` zurück
 * (siehe src/lib/services/httpFetch.ts).
 */
import type { LlmConfig } from '../src/lib/types';
import type { AiAction } from '../src/lib/services/aiActions/types';
import { runAiAction } from '../src/lib/services/aiActions/runner';

export interface Assertion<T> {
  id: string;
  label: string;
  /** Core-Assertions gaten den Qualitäts-Schwellwert; Soft-Assertions werden nur berichtet. */
  core: boolean;
  check: (result: T) => boolean;
}

export interface EvalStep<T> {
  label: string;
  /** userInput für runAiAction (z.B. via buildFeatureEffectsInput erzeugt). */
  input: string;
  assertions: Assertion<T>[];
}

export interface AssertionResult {
  id: string;
  label: string;
  core: boolean;
  passes: number;
  runs: number;
  passRate: number;
}

export interface StepReport {
  step: string;
  runs: number;
  errors: number;
  errorSamples: string[];
  latencyMs: { min: number; max: number; avg: number };
  assertions: AssertionResult[];
  /** JSON des ersten Ergebnisses, das ≥1 Core-Assertion verfehlt hat (zum Draufschauen). */
  failureSample?: string;
}

export interface Variant {
  label: string;
  systemPrompt: string;
}

/** Baut eine Varianten-Action mit überschriebenem System-Prompt (kein Prod-Eingriff). */
export function withSystemPrompt<T>(base: AiAction<T>, system: string): AiAction<T> {
  return { ...base, buildSystemPrompt: () => system };
}

/** Führt einen Step N-mal aus und aggregiert Pass-Raten, Latenz und Fehler. */
export async function runStep<T>(
  config: LlmConfig,
  action: AiAction<T>,
  step: EvalStep<T>,
  runs: number,
): Promise<StepReport> {
  const passCounts = new Map<string, number>(step.assertions.map((a) => [a.id, 0]));
  const latencies: number[] = [];
  let errors = 0;
  const errorSamples: string[] = [];
  let failureSample: string | undefined;

  for (let i = 0; i < runs; i++) {
    const t0 = Date.now();
    try {
      const result = await runAiAction<T>(config, action, step.input);
      latencies.push(Date.now() - t0);
      let coreFailed = false;
      for (const a of step.assertions) {
        let ok = false;
        try {
          ok = a.check(result);
        } catch {
          ok = false;
        }
        if (ok) passCounts.set(a.id, (passCounts.get(a.id) ?? 0) + 1);
        else if (a.core) coreFailed = true;
      }
      if (coreFailed && !failureSample) failureSample = JSON.stringify(result, null, 2);
    } catch (e) {
      latencies.push(Date.now() - t0);
      errors++;
      const msg = e instanceof Error ? e.message : String(e);
      if (errorSamples.length < 3) errorSamples.push(msg);
      // Ein geworfener Lauf verfehlt jede Assertion (die Zähler bleiben stehen).
    }
  }

  const assertions: AssertionResult[] = step.assertions.map((a) => {
    const passes = passCounts.get(a.id) ?? 0;
    return { id: a.id, label: a.label, core: a.core, passes, runs, passRate: passes / runs };
  });

  const lat = latencies.length ? latencies : [0];
  return {
    step: step.label,
    runs,
    errors,
    errorSamples,
    latencyMs: {
      min: Math.min(...lat),
      max: Math.max(...lat),
      avg: Math.round(lat.reduce((s, x) => s + x, 0) / lat.length),
    },
    assertions,
    failureSample,
  };
}

/** Nur die Core-Assertions eines Reports (die den Schwellwert gaten). */
export function coreAssertions(r: StepReport): AssertionResult[] {
  return r.assertions.filter((a) => a.core);
}

/** Führt dieselben Steps für mehrere Prompt-Varianten aus (A/B). */
export async function compareVariants<T>(
  config: LlmConfig,
  baseAction: AiAction<T>,
  variants: Variant[],
  steps: EvalStep<T>[],
  runs: number,
): Promise<Map<string, StepReport[]>> {
  const out = new Map<string, StepReport[]>();
  for (const v of variants) {
    const action = withSystemPrompt(baseAction, v.systemPrompt);
    const reports: StepReport[] = [];
    for (const step of steps) {
      reports.push(await runStep(config, action, step, runs));
    }
    out.set(v.label, reports);
  }
  return out;
}

const pct = (rate: number) => `${Math.round(rate * 100)}%`;

/** Menschenlesbarer Report eines einzelnen Steps. */
export function printStepReport(r: StepReport): void {
  console.log(
    `\n── Step: ${r.step} — ${r.runs} runs, ${r.errors} errors, avg ${r.latencyMs.avg}ms ──`,
  );
  console.table(
    r.assertions.map((a) => ({
      assertion: `${a.core ? '● ' : '○ '}${a.label}`,
      passRate: pct(a.passRate),
      passes: `${a.passes}/${a.runs}`,
    })),
  );
  if (r.errorSamples.length) console.log('  errors:', r.errorSamples);
  if (r.failureSample) console.log('  first core-failure sample:\n', r.failureSample);
}

/** Vergleichs-Tabelle Assertion × Variante, je Step. */
export function printComparison<T>(byVariant: Map<string, StepReport[]>, steps: EvalStep<T>[]): void {
  steps.forEach((step, si) => {
    console.log(`\n══ Variant comparison — Step: ${step.label} ══`);
    const rows: Record<string, string>[] = step.assertions.map((a) => {
      const row: Record<string, string> = { assertion: `${a.core ? '● ' : '○ '}${a.label}` };
      for (const [variant, reports] of byVariant) {
        const ar = reports[si]?.assertions.find((x) => x.id === a.id);
        row[variant] = ar ? pct(ar.passRate) : '—';
      }
      return row;
    });
    const latRow: Record<string, string> = { assertion: 'avg latency' };
    const errRow: Record<string, string> = { assertion: 'errors' };
    for (const [variant, reports] of byVariant) {
      latRow[variant] = `${reports[si]?.latencyMs.avg ?? '—'}ms`;
      errRow[variant] = `${reports[si]?.errors ?? '—'}`;
    }
    console.table([...rows, latRow, errRow]);
  });
}
