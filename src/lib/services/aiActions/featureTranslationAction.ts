/**
 * Die deutsche Grenze der Merkmals-Deutung.
 *
 * Analyse und Effekt-Pass reasonen durchgehend ENGLISCH (`featureEffectsAction`); Deutsch
 * entsteht hier, in zwei schlanken Calls an den Rändern:
 *   T1 `translateChoices`   — nach der Analyse: aus den englischen Wahlen die deutschen
 *                             Fragen, Optionen und Konsequenz-Hilfen für den Checkpoint.
 *   T2 `translateSheetNotes` — nach dem Effekt-Pass: die englischen Bogen-Notizen ins
 *                             Deutsche, in der Form, die der Bogen braucht.
 *
 * Beide sind bewusst REASONING-FREI: `qualitymindsGenerateStructured` fährt guided decoding,
 * und das heißt auf QM/vllm zugleich `enable_thinking:false` (llmService) — also schnell.
 *
 * Beide degradieren, statt zu blocken: schlägt ein Call fehl oder passt seine Antwort nicht
 * zur Eingabe, bleibt der englische Text stehen. Ein unübersetzter Checkpoint ist bedienbar,
 * ein fehlender nicht.
 *
 * Die Arbeitsteilung mit Pass C ist der Grund für den Schnitt: **Pass C entscheidet, WAS auf
 * den Bogen gehört (`SHEET_NOTE_CONTENT`), dieser Call entscheidet, WIE es dasteht
 * (`SHEET_NOTE_GERMAN_FORM`).** Deshalb liegt auch das harte Zeichenbudget hier — Deutsch
 * läuft rund 17 % länger als Englisch, und gekürzt werden muss in der Zielsprache.
 */
import {
  choiceTranslationJsonSchema,
  parseChoiceTranslation,
  parseSheetNoteTranslations,
  sheetNoteTranslationsJsonSchema,
  CHOICE_HELP_MAX_CHARS,
  SHEET_NOTE_MAX_CHARS,
  type ChoiceTranslationItem,
} from '../../schemas/levelUp';
import type { LlmConfig } from '../../types';
import { qualitymindsGenerateStructured } from '../llmService';
import { SHEET_NOTE_GERMAN_FORM } from './fieldSummaryAction';

/** Was der Übersetzer je Merkmal als Quelle braucht (EN-Regeltext + DE-Fassung). */
export interface TranslationSource {
  name: string;
  nameDe?: string;
  desc: string;
  descDe?: string;
  key?: string;
}

/** Die englische Wahl, wie die Analyse sie liefert — Eingang für T1. */
export interface TranslatableChoice {
  id: string;
  featureKey: string;
  question: string;
  help: string;
  options: string[];
  optionHelp: Record<string, string>;
}

/** Das Übersetzungsergebnis einer Wahl; leere Felder heißen „nimm den englischen Text". */
export interface ChoiceTranslationResult {
  questionDe: string;
  helpDe: string;
  /** Parallel zu `options` der Eingabe — gleiche Länge, gleiche Reihenfolge. */
  optionsDe: string[];
  /** Geschlüsselt mit dem ENGLISCHEN Options-Label (der stabilen Kennung). */
  optionHelpDe: Record<string, string>;
}

const CHOICE_TRANSLATION_SYSTEM = `You translate the forced player choices of a Dungeons & Dragons 5e character (SRD 5.2 / German 5.2.1 terminology) into German, for a character sheet app whose UI is German.
<choices> holds the choices in English. <features> holds the features that raise them, each with the English rules text ("desc") and its official German translation ("descDe").

## Rules
1. An option label is a QUOTE, not a translation. Find the option in the feature's "descDe" and copy its German wording VERBATIM — for a bolded option paragraph \`**Wächter.**\` the label is \`Wächter\`. The player's stored answer is matched against that text later, so never paraphrase, expand, re-case or annotate it (no "Waldgnom (Forest Gnome)").
2. Only if "descDe" is missing or does not contain the option, translate it yourself using the current German 5.2.1 terminology.
3. Return the options in the SAME ORDER as the input and copy each "en" label verbatim — it is the key the app matches on.
4. questionDe: the question as you would ask a German player, short and direct.
5. helpDe: one German line on the MECHANICAL trade-off, e.g. "Wächter → Kriegswaffen + mittlere Rüstung; Magier → ein zusätzlicher bekannter Zaubertrick". HARD LIMIT ${CHOICE_HELP_MAX_CHARS} characters — German runs longer than English, so condense (arrows, no filler) rather than overshoot. Empty string if the options carry no notable consequence.
6. Each option's own helpDe: its concrete German consequence, ≤60 chars (e.g. "Schwarz" → "Säureschaden"). Empty string where an option has none.
7. Translate ONLY. Never add, drop, merge or reorder choices or options, and never invent a mechanic that is not in the rules text.`;

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

/** Nur die Merkmale, die eine der Wahlen wirklich stellt — der Rest ist hier Ballast. */
function sourcesForChoices(choices: TranslatableChoice[], features: TranslationSource[]): TranslationSource[] {
  const keys = new Set(choices.map((c) => c.featureKey).filter(Boolean));
  const hit = features.filter((f) => f.key && keys.has(f.key));
  // Ohne verwertbaren Key lieber alle Merkmale mitschicken als den Wortlaut zu verlieren.
  return hit.length ? hit : features;
}

/**
 * T1 — deutsche Fassung der erkannten Wahlen, geschlüsselt nach Choice-id.
 * Leere Map bei Fehlschlag; der Aufrufer fällt dann auf die englischen Texte zurück.
 */
export async function translateChoices(
  config: LlmConfig,
  ctx: { choices: TranslatableChoice[]; features: TranslationSource[] },
  opts: { signal?: AbortSignal } = {},
): Promise<Map<string, ChoiceTranslationResult>> {
  const out = new Map<string, ChoiceTranslationResult>();
  if (!ctx.choices.length) return out;

  const sources = sourcesForChoices(ctx.choices, ctx.features).map((f) => ({
    name: f.name,
    nameDe: f.nameDe ?? '',
    key: f.key ?? '',
    desc: f.desc,
    descDe: f.descDe ?? '',
  }));
  const input = [
    `<features>${JSON.stringify(sources)}</features>`,
    `<choices>${JSON.stringify(
      ctx.choices.map((c) => ({
        id: c.id,
        featureKey: c.featureKey,
        question: c.question,
        help: c.help,
        options: c.options,
        optionHelp: c.options.map((o) => ({ en: o, help: c.optionHelp[o] ?? '' })),
      })),
    )}</choices>`,
  ].join('\n');

  let items: ChoiceTranslationItem[];
  try {
    const raw = await qualitymindsGenerateStructured(config, input, choiceTranslationJsonSchema, CHOICE_TRANSLATION_SYSTEM, {
      signal: opts.signal,
    });
    items = parseChoiceTranslation(raw)?.items ?? [];
  } catch (e) {
    if (opts.signal?.aborted) throw e; // Abbruch nie verschlucken
    return out;
  }

  const byId = new Map(items.map((i) => [i.id, i]));
  for (const choice of ctx.choices) {
    const item = byId.get(choice.id);
    if (!item) continue;
    // Eine Options-Liste anderer Länge ist keine Übersetzung mehr, sondern eine zweite
    // Meinung: dann bleibt Englisch stehen, damit Label und Wert nicht auseinanderlaufen.
    const byEn = new Map(item.options.map((o) => [o.en, o]));
    const usable = choice.options.every((o) => byEn.get(o)?.de.trim());
    out.set(choice.id, {
      questionDe: item.questionDe.trim(),
      helpDe: item.helpDe.trim(),
      optionsDe: usable ? choice.options.map((o) => byEn.get(o)!.de.trim()) : [],
      optionHelpDe: usable
        ? Object.fromEntries(
            choice.options.map((o) => [o, byEn.get(o)?.helpDe.trim() ?? '']).filter(([, v]) => !!v),
          )
        : {},
    });
  }
  return out;
}

/** Eine zu übersetzende Bogen-Notiz samt ihrem Merkmal. */
export interface TranslatableNote {
  index: number;
  featureKey: string;
  featureName: string;
  note: string;
}

/**
 * T2 — deutsche Bogen-Notizen, geschlüsselt nach `index`. Leere Map bei Fehlschlag; der
 * Aufrufer lässt dann die englische Notiz stehen.
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
