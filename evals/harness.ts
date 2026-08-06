/**
 * Generischer Eval-Harness für die Prompt-Qualität der KI-Actions: eine Action läuft N-mal
 * gegen echte LLM-Calls, gezählt wird die PASS-RATE über die Läufe — ein einzelnes Ergebnis
 * sagt bei nicht-deterministischen Antworten nichts. `runEval` misst immer GENAU EINEN
 * Prompt; Prompts vergleicht man, indem man die Reports zweier Läufe nebeneinanderlegt.
 *
 * Transport über den echten Produktionspfad (`runAiAction`); mitgeschnitten werden Latenz,
 * Server-Zeit, Tokens und der echte Request/Response (siehe report.ts).
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
  /**
   * Action dieses Steps. Überschreibt die an `runEval` übergebene Action — so kann
   * eine Strecke mehrere Actions messen (z.B. Anlage UND Überarbeitung).
   */
  action?: AiAction<T>;
  /**
   * Optionaler Eigen-Aufruf STATT `runAiAction(action, input)`. Für Actions, deren
   * Produktionspfad nicht der generische Ein-Call ist — z.B. der Notiz-Pass mit
   * anschließendem Übersetzungs-Call. Ist `run` gesetzt, werden
   * `action`/`input` für den Aufruf ignoriert (`input` bleibt nur für den Report-Mitschnitt).
   */
  run?: (config: LlmConfig) => Promise<T>;
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

/** Ein einzelner LLM-Call innerhalb eines Laufs (Request + zugehörige Response). */
export interface RunCall {
  /** Provider-Label des Calls (z.B. 'chat'). */
  label?: string;
  /** Echter Request (URL, redigierte Header, Body = voller Prompt+Schema). */
  request?: unknown;
  /** Rohe Response (content, tool_calls, usage …). */
  response?: unknown;
  /** Server-Round-Trip dieses Calls. */
  serverMs?: number;
  usage?: { sent: number; received: number };
}

/** Vollständiger Mitschnitt eines einzelnen Laufs (für den Datei-Report). */
export interface RunRecord {
  index: number;
  ok: boolean;
  error?: string;
  /** Wall-Clock um den Lauf (alle Calls inkl. Grounding/Retry). */
  latencyMs: number;
  /** Server-Zeit über ALLE Calls des Laufs summiert (falls vorhanden). */
  serverMs?: number;
  /** Tokens über ALLE Calls des Laufs summiert. */
  usage?: { sent: number; received: number };
  /** Alle LLM-Calls dieses Laufs in Reihenfolge. Ein-Call-Pfad: 1; mit Übersetzung: mehrere. */
  calls: RunCall[];
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
  tokens: { sentTotal: number; receivedTotal: number; avgSent: number; avgReceived: number };
  assertions: AssertionResult[];
  /** JSON des ersten Ergebnisses, das ≥1 Core-Assertion verfehlt hat (zum Draufschauen). */
  failureSample?: string;
  /** Vollständige Läufe (echte Requests/Responses/Zeiten) für den Datei-Report. */
  records: RunRecord[];
}

/**
 * Per-Case-Timeout, damit ein hängender LLM-Request nicht den ganzen Lauf blockiert.
 * 240s, weil ein Case eine ganze Call-KETTE sein kann: die Merkmals-Finalisierung fährt
 * Analyse + Übersetzung + Nach-Analyse + Guided + Übersetzung und liegt gemessen bei ~110s.
 */
const CALL_TIMEOUT_MS = Number(process.env.EVAL_CALL_TIMEOUT_MS ?? 240_000);

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

/**
 * Paart die Debug-Einträge eines Laufs zu einzelnen Calls (Request→Response) und summiert
 * Server-Zeit/Tokens über ALLE Calls. Requests kommen sequenziell vor ihrer Response, daher
 * genügt es, jede Response dem zuletzt geöffneten Call zuzuordnen — so wird auch der
 * Übersetzungs-Call hinter dem Notiz-Pass vollständig erfasst.
 */
function summarizeCalls(entries: CapturedCall[]): Pick<RunRecord, 'calls' | 'serverMs' | 'usage'> {
  const calls: RunCall[] = [];
  for (const e of entries) {
    if (e.type === 'request') {
      calls.push({ label: e.label, request: e.data });
      continue;
    }
    const cur = calls[calls.length - 1];
    if (!cur) continue;
    cur.response = e.data;
    if (e.durationMs != null) cur.serverMs = e.durationMs;
    const u = (e.data as { usage?: { sent: number; received: number } })?.usage;
    if (u) cur.usage = u;
  }
  const serverTotal = calls.reduce((s, c) => s + (c.serverMs ?? 0), 0);
  const usage = calls.some((c) => c.usage)
    ? {
        sent: calls.reduce((s, c) => s + (c.usage?.sent ?? 0), 0),
        received: calls.reduce((s, c) => s + (c.usage?.received ?? 0), 0),
      }
    : undefined;
  return { calls, serverMs: serverTotal > 0 ? serverTotal : undefined, usage };
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
  action: AiAction<T> | null,
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
      const exec = (): Promise<T> => {
        if (step.run) return step.run(config);
        const act = step.action ?? action;
        if (!act) throw new Error(`Step "${step.label}" hat weder run noch eine Action.`);
        return runAiAction<T>(config, act, step.input, { noRetry: true });
      };
      const { result, error, entries } = await captureRun(() => withTimeout(exec(), CALL_TIMEOUT_MS));
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
          `${summary.usage ? `, ${summary.usage.sent}↑/${summary.usage.received}↓ tok` : ''}` +
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

  const sent = records.map((r) => r.usage?.sent ?? 0);
  const received = records.map((r) => r.usage?.received ?? 0);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : 0);
  return {
    step: step.label,
    runs,
    errors: records.filter((r) => !r.ok).length,
    errorSamples,
    latencyMs: stats(records.map((r) => r.latencyMs)),
    serverMs: stats(records.map((r) => r.serverMs ?? 0).filter((x) => x > 0)),
    tokens: {
      sentTotal: sent.reduce((s, x) => s + x, 0),
      receivedTotal: received.reduce((s, x) => s + x, 0),
      avgSent: avg(sent),
      avgReceived: avg(received),
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
  action: AiAction<T> | null,
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
      `~${r.tokens.avgSent}↑/${r.tokens.avgReceived}↓ tok/resp ──`,
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
