/**
 * Je neu gewonnenem Merkmal eine Bogenzeile fürs PDF — der einzige KI-Anteil der
 * Merkmals-Strecke, seit Wahlen und Zaubergewährung aus der Deklaration kommen.
 * QM-only; EIN Guided Call, danach die deutsche Grenze (`translateSheetNotes`).
 */
import { featureNotesJsonSchema, parseFeatureNotes, type FeatureNote } from '../../schemas/levelUp';
import { translateSheetNotes, type TranslationSource } from './featureTranslationAction';
import type { LlmConfig } from '../../types';
import { qualitymindsGenerateStructured } from '../llm/openAiCompatible';
import type { FeatureClassContext, GainedFeature } from '../analysis/types';
import { FEATURE_NOTES_SYSTEM, buildFeatureNotesInput } from './featureNotesPrompts';
export { FEATURE_NOTES_SYSTEM, buildFeatureNotesInput };

export interface FeatureNotesContext {
  classContext: FeatureClassContext;
  features: GainedFeature[];
  /**
   * Options-Paare der getroffenen Wahlen als feste Begriffe für die Übersetzung: eine Notiz
   * nennt die gewählte Option („Magic Initiate (Wizard)"), und ohne dieses Paar wird daraus
   * „Zauberer" statt „Magier". Gehen NICHT in den Notiz-Call — der formuliert englisch.
   */
  terms?: { en: string; de: string }[];
}

export interface FeatureNotesRunOptions {
  onActivity?: () => void; // Lebenszeichen pro Streaming-Delta (Stuck-Erkennung der UI)
  signal?: AbortSignal;
  /** Für Prompt-Evals true: sonst kaschiert der Retry die First-Try-Qualität des Prompts. */
  noRetry?: boolean;
}

/**
 * QM-only, weil der Pfad Guided Output über ein eigenes JSON-Schema braucht. Als Prädikat
 * exportiert, damit der Aufstieg den Ausfall vor den Spielerentscheidungen ankündigen kann
 * statt ihn danach als Fehler zu melden — die Provider-Kenntnis bleibt in dieser Datei.
 */
export const canSummarizeFeatureNotes = (config: LlmConfig): boolean => config.provider === 'qualityminds';

function guardQualityMinds(config: LlmConfig): void {
  if (!canSummarizeFeatureNotes(config))
    throw new Error(
      'Merkmals-Notizen laufen nur über den QualityMinds-Pfad (Structured Output). ' +
        'Bitte ein QualityMinds-Modell wählen.',
    );
}

function translationSources(features: GainedFeature[]): TranslationSource[] {
  return features.map((f) => ({ name: f.name, nameDe: f.nameDe, desc: f.desc, descDe: f.descDe, key: f.key }));
}

/**
 * Die Übersetzung sitzt HIER und nicht beim Aufrufer: beide Flows und die Eval-Strecke sehen
 * denselben fertigen, deutschen Satz Notizen.
 */
export async function summarizeFeatureNotes(
  config: LlmConfig,
  ctx: FeatureNotesContext,
  opts: FeatureNotesRunOptions = {},
): Promise<FeatureNote[]> {
  guardQualityMinds(config);
  if (!ctx.features.length) return [];

  const input = buildFeatureNotesInput(ctx);
  const runCall = async (): Promise<FeatureNote[] | null> => {
    try {
      const raw = await qualitymindsGenerateStructured(config, input, featureNotesJsonSchema, FEATURE_NOTES_SYSTEM, {
        signal: opts.signal,
        onDelta: () => opts.onActivity?.(),
      });
      return parseFeatureNotes(raw)?.notes ?? null;
    } catch (e) {
      if (opts.signal?.aborted) throw e; // Abbruch nie verschlucken
      return null;
    }
  };

  let notes = await runCall();
  if (!notes && !opts.noRetry) notes = await runCall();
  if (!notes) throw new Error('Die KI lieferte keine schema-validen Merkmals-Notizen.');

  return germanizeSheetNotes(config, notes, ctx, opts);
}

/** Deutsche Bogen-Notizen anhängen. Bei Fehlschlag bleibt die englische Zeile stehen. */
async function germanizeSheetNotes(
  config: LlmConfig,
  notes: FeatureNote[],
  ctx: FeatureNotesContext,
  opts: FeatureNotesRunOptions,
): Promise<FeatureNote[]> {
  const translatable = notes
    .map((n, index) => ({ index, featureKey: n.featureKey, featureName: n.featureName, note: n.sheetNote.trim() }))
    .filter((n) => n.note);
  if (!translatable.length) return notes;

  const translated = await translateSheetNotes(
    config,
    { notes: translatable, features: translationSources(ctx.features), terms: ctx.terms },
    { signal: opts.signal },
  );
  if (!translated.size) return notes;
  return notes.map((n, index) => {
    const de = translated.get(index);
    return de ? { ...n, sheetNote: de } : n;
  });
}
