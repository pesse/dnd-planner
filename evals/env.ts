/**
 * Gemeinsame Env-Konfiguration ALLER Eval-Strecken.
 *
 * Bündelt, was bisher in jedem `*.eval.test.ts` dupliziert war: Gate über
 * QM_API_KEY + EVAL_MODEL, LlmConfig, Läufe/Schwellwert/Nebenläufigkeit sowie
 * Titel-Label und Beschreibung des Reports. Damit besteht eine neue Eval-Strecke
 * nur noch aus Fällen + Assertions (siehe defineEval.ts).
 */
import type { LlmConfig } from '../src/lib/types';

export interface EvalEnv {
  /** Ohne API-Key/Modell wird jede Eval-Suite übersprungen (kein CI-Bruch). */
  enabled: boolean;
  config: LlmConfig;
  provider: string;
  model: string;
  /** Läufe je Step (Pass-Rate-Basis). */
  runs: number;
  /** Mindest-Pass-Rate der Core-Assertions. */
  threshold: number;
  /** Parallele Läufe je Step (1 = saubere Einzel-Latenz). */
  concurrency: number;
  /**
   * Optionales Lauf-Label (EVAL_TITLE), z.B. „baseline" oder „kurzer-prompt".
   * Wird an den Eval-Namen angehängt → `reports/<ts>-<eval>-<label>/`. So bleiben
   * mehrere Strecken in EINEM Lauf unterscheidbar und trotzdem vergleichbar.
   */
  label?: string;
  description?: string;
}

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== '' ? n : fallback;
};

let warned = false;

export function evalEnv(): EvalEnv {
  const apiKey = process.env.QM_API_KEY;
  const model = process.env.EVAL_MODEL;
  const enabled = !!apiKey && !!model;

  if (!enabled && !warned) {
    warned = true;
    console.warn(
      '[eval] übersprungen — setze QM_API_KEY und EVAL_MODEL (oder eine .env), um die Evals zu laufen.',
    );
  }

  return {
    enabled,
    provider: 'qualityminds',
    model: model ?? '',
    config: {
      provider: 'qualityminds',
      model: model ?? '',
      apiKey: apiKey ?? '',
      maxTokens: num(process.env.EVAL_MAX_TOKENS, 4096),
      // Optional: eigener OpenAI-kompatibler Endpoint (Default = QualityMinds).
      // Greift für die Prompt-Werkstatt (rawChatCompletion); Action-Pfade nutzen
      // weiterhin die Provider-Basis.
      ...(process.env.EVAL_BASE_URL ? { baseUrl: process.env.EVAL_BASE_URL } : {}),
    },
    runs: num(process.env.EVAL_RUNS, 5),
    threshold: num(process.env.EVAL_THRESHOLD, 0.9),
    // Nur die Runs je Step laufen parallel; Steps bleiben sequenziell.
    concurrency: num(process.env.EVAL_CONCURRENCY, 4),
    label: process.env.EVAL_TITLE || undefined,
    description: process.env.EVAL_DESC || undefined,
  };
}
