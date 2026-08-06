/**
 * Die deutsche Grenze der Merkmals-Strecke: `featureNotesAction` formuliert englisch, Deutsch
 * entsteht hier in EINEM Call am Rand.
 *
 * Er ist REASONING-FREI (guided decoding heißt auf QM/vllm `enable_thinking:false`) und
 * degradiert statt zu blocken: bei Fehlschlag bleibt der englische Text stehen.
 *
 * Der Notiz-Pass entscheidet, WAS auf den Bogen gehört (`SHEET_NOTE_CONTENT`), dieser Call,
 * WIE es dasteht (`SHEET_NOTE_GERMAN_FORM`) — deshalb liegt das Zeichenbudget hier: Deutsch
 * läuft rund 17 % länger als Englisch, und gekürzt werden muss in der Zielsprache.
 */
import {
  parseSheetNoteTranslations,
  sheetNoteTranslationsJsonSchema,
  SHEET_NOTE_MAX_CHARS,
} from '../../schemas/levelUp';
import type { LlmConfig } from '../../types';
import { qualitymindsGenerateStructured } from '../llm/openAiCompatible';
import { SHEET_NOTE_GERMAN_FORM } from './fieldSummaryAction';

export interface TranslationSource {
  name: string;
  nameDe?: string;
  desc: string;
  descDe?: string;
  key?: string;
}

const SHEET_NOTE_TRANSLATION_SYSTEM = `You translate character-sheet notes for a Dungeons & Dragons 5e app (SRD 5.2 / German 5.2.1 terminology) from English into German.
<notes> holds the English notes, each with an index and the feature it belongs to. <features> holds those features with their official German rules text ("descDe") and German name ("nameDe"). <glossary_de> adds further fixed term pairs.

## Rules
1. Return one entry per input note, with its "index" copied verbatim. Never merge, drop or reorder notes.
2. Start each note with the feature's "nameDe", followed by ": " and the effect — exactly as the English note does. A note that is just a sense and its range ("Darkvision 120 ft") needs no colon.
3. EVERY German game term is a QUOTE, never your own translation. Spell names, class names, condition names, feature names and option labels all appear in the feature's own "descDe" or in <glossary_de> — copy them from there, character for character ("Speak with Animals" → "Mit Tieren sprechen", never "Tiergespräch"). If a term genuinely appears in neither, keep the English name rather than inventing a German one.
4. HARD LIMIT: ${SHEET_NOTE_MAX_CHARS} characters per note, single line, no markdown. German runs longer than English, so condense to fit: use the abbreviations below, drop filler words, keep every number, die, action type and recharge. Never drop the mechanic itself, and never abbreviate a name.
5. Translate ONLY. No new information, no rules you were not given.

## How the German line reads
${SHEET_NOTE_GERMAN_FORM}`;

export interface TranslatableNote {
  index: number;
  featureKey: string;
  featureName: string;
  note: string;
}

/**
 * Deutsche Bogen-Notizen, geschlüsselt nach `index`. Leere Map bei Fehlschlag; der Aufrufer
 * lässt dann die englische Notiz stehen.
 */
export async function translateSheetNotes(
  config: LlmConfig,
  ctx: { notes: TranslatableNote[]; features: TranslationSource[]; terms?: { en: string; de: string }[] },
  opts: { signal?: AbortSignal } = {},
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!ctx.notes.length) return out;

  // `descDe` MUSS mit: ein Namenspaar allein reicht nicht, weil in der Notiz auch Zauber-,
  // Zustands- und Optionsnamen stecken. Ohne die deutsche Regelprosa als Zitatquelle erfand
  // das Modell sie („Tiergespräch" statt „Mit Tieren sprechen", „Zaubersorger" statt
  // „Zauberer" — gemessen 2026-07-29). Nur die Merkmale MIT Notiz, und nur hier: dieser Call
  // denkt nicht, die Token kosten also fast nichts.
  const needed = new Set(ctx.notes.map((n) => n.featureKey).filter(Boolean));
  const sources = ctx.features.filter((f) => !f.key || needed.has(f.key));
  const input = [
    `<features>${JSON.stringify(
      (sources.length ? sources : ctx.features).map((f) => ({
        name: f.name,
        nameDe: f.nameDe || f.name,
        descDe: f.descDe ?? '',
      })),
    )}</features>`,
    ...(ctx.terms?.length ? [`<glossary_de>${JSON.stringify(ctx.terms)}</glossary_de>`] : []),
    `<notes>${JSON.stringify(ctx.notes)}</notes>`,
  ].join('\n');

  try {
    const raw = await qualitymindsGenerateStructured(config, input, sheetNoteTranslationsJsonSchema, SHEET_NOTE_TRANSLATION_SYSTEM, {
      signal: opts.signal,
    });
    for (const n of parseSheetNoteTranslations(raw)?.notes ?? []) {
      const note = n.noteDe.replace(/\s*[\r\n]+\s*/g, ' ').trim();
      if (note) out.set(n.index, note);
    }
  } catch (e) {
    if (opts.signal?.aborted) throw e;
  }
  return out;
}
