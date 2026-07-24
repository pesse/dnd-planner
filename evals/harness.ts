/**
 * Generischer Eval-Harness für die Prompt-Qualität der KI-Actions.
 *
 * Idee: Eine Action wird mit einem definierten Input N-mal gegen einen echten
 * LLM-Call ausgeführt; jeder Lauf wird gegen eine Liste von Assertions geprüft.
 * Weil LLM-Antworten nicht deterministisch sind, zählt die **Pass-Rate** über N
 * Läufe, nicht ein einzelnes Ergebnis. Ausgewertet wird immer GENAU EIN Prompt
 * (`runEval`); um Prompts zu vergleichen, führt man mehrere Läufe aus und legt die
 * entstehenden Reports (jeweils mit eigenem Titel/Beschreibung) nebeneinander.
 *
 * Der Netzwerk-Transport läuft über den echten Produktionspfad (`runAiAction`);
 * außerhalb von Tauri fällt `httpFetch` auf das globale `fetch` zurück
 * (siehe src/lib/services/httpFetch.ts). Pro Lauf werden Latenz, Server-Zeit,
 * Token-Usage sowie der echte Request/Response mitgeschnitten (siehe report.ts).
 */
import type { LlmConfig } from '../src/lib/types';
import type { AiAction } from '../src/lib/services/aiActions/types';
import { runAiAction } from '../src/lib/services/aiActions/runner';
import { captureRun, type CapturedCall } from './report';

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

export interface LatencyStats {
  min: number;
  max: number;
  avg: number;
  median: number;
  p95: number;
  total: number;
}

/** Vollständiger Mitschnitt eines einzelnen Laufs (für den Datei-Report). */
export interface RunRecord {
  index: number;
  ok: boolean;
  error?: string;
  /** Wall-Clock um runAiAction (inkl. extractJson/Retry). */
  latencyMs: number;
  /** Server-Round-Trip aus dem Debug-Log (falls vorhanden). */
  serverMs?: number;
  usage?: { sent: number; received: number };
  /** Echter Request (URL, redigierte Header, Body = voller Prompt+Schema). */
  request?: unknown;
  /** Rohe Response (content, tool_calls, usage …). */
  response?: unknown;
  /** Geparstes, schema-valides Ergebnis (null bei Fehler). */
  result?: unknown;
  assertions: { id: string; pass: boolean }[];
}

export interface StepReport {
  step: string;
  runs: number;
  errors: number;
  errorSamples: string[];
  latencyMs: LatencyStats;
  serverMs: LatencyStats;
  tokens: { sentTotal: number; receivedTotal: number; avgReceived: number };
  assertions: AssertionResult[];
  /** JSON des ersten Ergebnisses, das ≥1 Core-Assertion verfehlt hat (zum Draufschauen). */
  failureSample?: string;
  /** Vollständige Läufe (echte Requests/Responses/Zeiten) für den Datei-Report. */
  records: RunRecord[];
}

/** Baut eine Action mit überschriebenem System-Prompt (kein Prod-Eingriff). */
export function withSystemPrompt<T>(base: AiAction<T>, system: string): AiAction<T> {
  return { ...base, buildSystemPrompt: () => system };
}

/** Per-Call-Timeout, damit ein hängender LLM-Request nicht den ganzen Lauf blockiert. */
const CALL_TIMEOUT_MS = Number(process.env.EVAL_CALL_TIMEOUT_MS ?? 120_000);

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`call timeout after ${Math.round(ms / 1000)}s`)), ms);
    p.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}

/** Führt `fn` über alle Items mit begrenzter Nebenläufigkeit aus; Reihenfolge bleibt erhalten. */
async function mapLimit<A, R>(
  items: A[],
  limit: number,
  fn: (item: A, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  };
  const width = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: width }, worker));
  return results;
}

function stats(xs: number[]): LatencyStats {
  if (!xs.length) return { min: 0, max: 0, avg: 0, median: 0, p95: 0, total: 0 };
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.round(p * (s.length - 1)))];
  const total = s.reduce((acc, x) => acc + x, 0);
  return {
    min: s[0],
    max: s[s.length - 1],
    avg: Math.round(total / s.length),
    median: q(0.5),
    p95: q(0.95),
    total,
  };
}

/** Extrahiert Server-Zeit/Usage/Request/Response aus den Debug-Einträgen eines Laufs. */
function summarizeCalls(calls: CapturedCall[]): Pick<RunRecord, 'serverMs' | 'usage' | 'request' | 'response'> {
  const request = calls.find((c) => c.type === 'request')?.data;
  const responseEntry = [...calls].reverse().find((c) => c.type === 'response');
  const data = responseEntry?.data as { usage?: { sent: number; received: number } } | undefined;
  return {
    serverMs: responseEntry?.durationMs,
    usage: data?.usage ?? undefined,
    request,
    response: responseEntry?.data,
  };
}

const coreIds = <T>(step: EvalStep<T>) => new Set(step.assertions.filter((a) => a.core).map((a) => a.id));

/**
 * Führt einen Step N-mal aus (bis zu `concurrency` gleichzeitig) und aggregiert
 * Pass-Raten, Latenz, Tokens und die echten Mitschnitte. concurrency=1 → sequenziell
 * (saubere Einzel-Latenz). Jeder Lauf läuft in seinem eigenen Capture-Kontext, damit
 * Request/Response auch bei Parallelität korrekt zugeordnet werden.
 */
export async function runStep<T>(
  config: LlmConfig,
  action: AiAction<T>,
  step: EvalStep<T>,
  runs: number,
  concurrency: number,
): Promise<StepReport> {
  const cores = coreIds(step);

  const records = await mapLimit(
    Array.from({ length: runs }, (_, i) => i),
    concurrency,
    async (_item, i): Promise<RunRecord> => {
      const t0 = Date.now();
      console.log(`  · ${step.label}: run ${i + 1}/${runs} …`);
      // noRetry: die Eval misst die First-Try-Qualität des Prompts — kein Nachbessern.
      const { result, error, entries } = await captureRun(() =>
        withTimeout(runAiAction<T>(config, action, step.input, { noRetry: true }), CALL_TIMEOUT_MS),
      );
      const latencyMs = Date.now() - t0;
      const summary = summarizeCalls(entries);

      if (error !== undefined || result === undefined) {
        const msg = error instanceof Error ? error.message : String(error ?? 'kein Ergebnis');
        console.log(`    → FEHLER ${(latencyMs / 1000).toFixed(1)}s: ${msg}`);
        return {
          index: i,
          ok: false,
          error: msg,
          latencyMs,
          ...summary,
          assertions: step.assertions.map((a) => ({ id: a.id, pass: false })),
        };
      }

      const assertions = step.assertions.map((a) => {
        let ok = false;
        try {
          ok = a.check(result);
        } catch {
          ok = false;
        }
        return { id: a.id, pass: ok };
      });
      const corePass = assertions.filter((a) => a.pass && cores.has(a.id)).length;
      console.log(
        `    → ok ${(latencyMs / 1000).toFixed(1)}s` +
          `${summary.serverMs ? ` (server ${(summary.serverMs / 1000).toFixed(1)}s)` : ''}` +
          `${summary.usage ? `, ${summary.usage.received} tok` : ''}` +
          `, core ${corePass}/${cores.size}`,
      );
      return { index: i, ok: true, latencyMs, result, ...summary, assertions };
    },
  );

  const passCounts = new Map<string, number>(step.assertions.map((a) => [a.id, 0]));
  for (const r of records) {
    for (const a of r.assertions) if (a.pass) passCounts.set(a.id, (passCounts.get(a.id) ?? 0) + 1);
  }
  const errorSamples = records.filter((r) => !r.ok && r.error).slice(0, 3).map((r) => r.error!);
  const firstCoreFail = records.find(
    (r) => r.ok && r.assertions.some((a) => !a.pass && cores.has(a.id)),
  );

  const assertions: AssertionResult[] = step.assertions.map((a) => {
    const passes = passCounts.get(a.id) ?? 0;
    return { id: a.id, label: a.label, core: a.core, passes, runs, passRate: passes / runs };
  });

  const received = records.map((r) => r.usage?.received ?? 0);
  return {
    step: step.label,
    runs,
    errors: records.filter((r) => !r.ok).length,
    errorSamples,
    latencyMs: stats(records.map((r) => r.latencyMs)),
    serverMs: stats(records.map((r) => r.serverMs ?? 0).filter((x) => x > 0)),
    tokens: {
      sentTotal: records.reduce((s, r) => s + (r.usage?.sent ?? 0), 0),
      receivedTotal: received.reduce((s, x) => s + x, 0),
      avgReceived: received.length ? Math.round(received.reduce((s, x) => s + x, 0) / received.length) : 0,
    },
    assertions,
    failureSample: firstCoreFail ? JSON.stringify(firstCoreFail.result, null, 2) : undefined,
    records,
  };
}

/** Nur die Core-Assertions eines Reports (die den Schwellwert gaten). */
export function coreAssertions(r: StepReport): AssertionResult[] {
  return r.assertions.filter((a) => a.core);
}

/**
 * Führt EINEN Prompt über alle Steps aus. Vergleich zwischen Prompts passiert
 * bewusst NICHT hier, sondern über mehrere Läufe → mehrere Reports (jeweils mit
 * eigenem Titel/Beschreibung), die sich extern nebeneinanderlegen lassen.
 *
 * `onProgress` feuert nach JEDEM fertigen Step mit dem aktuellen Zwischenstand —
 * so kann der Aufrufer inkrementell auf Platte schreiben (überlebt Timeouts).
 */
export async function runEval<T>(
  config: LlmConfig,
  action: AiAction<T>,
  steps: EvalStep<T>[],
  runs: number,
  concurrency: number,
  onProgress?: (partial: StepReport[], justFinished: StepReport) => void,
): Promise<StepReport[]> {
  const reports: StepReport[] = [];
  for (const step of steps) {
    const report = await runStep(config, action, step, runs, concurrency);
    reports.push(report);
    onProgress?.([...reports], report);
  }
  return reports;
}

const pct = (rate: number) => `${Math.round(rate * 100)}%`;

/** Menschenlesbarer Report eines einzelnen Steps. */
export function printStepReport(r: StepReport): void {
  console.log(
    `\n── Step: ${r.step} — ${r.runs} runs, ${r.errors} errors, ` +
      `latenz avg ${r.latencyMs.avg}ms (median ${r.latencyMs.median}, p95 ${r.latencyMs.p95}), ` +
      `~${r.tokens.avgReceived} tok/resp ──`,
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
