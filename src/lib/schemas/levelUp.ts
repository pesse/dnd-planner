/**
 * Schemas für den KI-gestützten Stufenaufstieg (Level-Up).
 *
 * KI-Outputs (Zod = Single Source + LLM-JSON-Schema): `featureEffectsSchema` (Rider),
 * `levelUpNarrativeSchema`, `fieldSummarySchema`. Die pro-Stufe-Effekte sind KEIN
 * KI-Output mehr — sie stehen als `grants.perLevel` in der Bibliothek
 * (`services/perLevelEffects.ts`). Das gemeinsame Dokument (`levelUpChangeSetSchema` /
 * `LevelUpDoc`) ist die Single Source für Anzeige UND Anwendung — es wird deterministisch
 * aus dem Zustand gebaut (levelUpMachine.buildDoc), nicht von einem LLM.
 *
 * Bewusst KEINE Anbindung an schemaValidation.ts (dessen `parse` verlangt ein
 * `name`-Feld) — die Runtime-Guards leben hier.
 */
import { z } from 'zod';
import { toLlmJsonSchema, ARMOR_TRAININGS, SKILL_NAMES, WEAPON_CATEGORIES } from './shared';

export const QUESTION_TYPES = ['choice', 'multiselect', 'number', 'text', 'spell-picker', 'hp-roll'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

const questionOptionSchema = z.object({
  value: z.string(),
  label: z.string(), // DE
});

const questionSchema = z.object({
  id: z.string().describe('Stable key, e.g. "subclass" | "hp_method" | "hp_roll" | "asi_or_feat" | "asi_dist" | "cantrips" | "q1".'),
  type: z.enum(QUESTION_TYPES),
  prompt: z.string().describe('GERMAN, user-facing question.'),
  help: z.string().default('').describe('GERMAN, optional one-line explanation.'),
  options: z.array(questionOptionSchema).default([]).describe('For choice/multiselect; label in GERMAN.'),
  defaultValue: z.string().default('').describe('Pre-filled option value or number as string.'),
  min: z.number().optional(),
  max: z.number().optional(),
  required: z.boolean().default(true),
  // Nur für type "spell-picker": erlaubte Zaubergrade + Klassenfilter für die Bibliothekssuche.
  spellLevels: z.array(z.number().int()).default([]),
  spellClass: z.string().default(''),
  // Nur für type "hp-roll": Würfelseiten (Trefferwürfel) + Anzahl Würfe (= gewonnene Stufen).
  dieSides: z.number().int().optional(),
  rollCount: z.number().int().optional(),
  // true = die Antwort BESTIMMT weitere mechanische Grants, die der Effekt-Pass DANACH
  // berechnen muss (z.B. Zirkel des Landes: Landart → immer vorbereitete Kreissprüche).
  // false für Wahlen, deren Antwort direkt der Effekt ist (Skill, +1 Attribut, Kampfstil).
  resolvesEffects: z.boolean().default(false).describe('true = the choice determines further grants; run the effects pass again with it resolved before finishing.'),
  // Anker, unter dem die Antwort im Merkmals-Ledger des Charakters landet. Leer bei
  // Fragen, die kein Bibliotheks-Merkmal stellt (TP-Methode, ASI-Verteilung).
  featureKey: z.string().default('').describe('Library key of the feature that forces this choice; empty for questions the flow itself asks.'),
  // false = Wahl pro Einsatz; sie wird beantwortet, aber nicht als Aufbau-Entscheidung
  // im Ledger festgehalten.
  isBuildDecision: z.boolean().default(false).describe('true = permanent build decision worth recording on the character.'),
});

const abilityDeltaSchema = z.object({
  str: z.number().int().default(0),
  ges: z.number().int().default(0),
  kon: z.number().int().default(0),
  int: z.number().int().default(0),
  wei: z.number().int().default(0),
  cha: z.number().int().default(0),
});

// ── Feature-Effekte (KI deutet die Prosa neu gewonnener Merkmale/Talente) ───────
//
// Fertigkeiten/Waffen/Rüstung sind GESCHLOSSENE, englische Vokabulare (shared.ts) —
// Guided Decoding kann damit gar keinen Namen erfinden, den der Bogen nicht kennt.
// Vorher waren es freie Strings und die Zuweisung fiel still durch, weil der Bogen
// deutsche Schlüssel führt (`MitTierenUmgehen`). Übersetzt wird beim Anwenden
// (`skillSheetKey`). `tools`/`languages` bleiben Freitext (kein Vokabular, und in
// 2024 sind Sprachen ohnehin keine Übung mehr).
const riderProficienciesSchema = z.object({
  skills: z.array(z.enum(SKILL_NAMES)).default([]),
  tools: z.array(z.string()).default([]),
  weapons: z.array(z.enum(WEAPON_CATEGORIES)).default([]),
  armor: z.array(z.enum(ARMOR_TRAININGS)).default([]),
  languages: z.array(z.string()).default([]),
  savingThrows: z.array(z.string()).default([]),
});

/**
 * Richtwert für die Länge einer `sheetNote`. Der Klassenmerkmale-Freitext landet beim
 * PDF-Export in zwei Formularfeldern à ~700 Zeichen (characterExport.splitClassFeatures)
 * und WÄCHST mit jeder Stufe — Kürze ist hier also auch ein Platzthema.
 *
 * 160 statt der früheren 100 Zeichen: bei 100 fiel regelmäßig die Mechanik selbst raus
 * (Aktionsart, Würfel, Wiederaufladung). Wird der Kasten zu voll, verdichtet der
 * Zusammenfassen-Knopf im Charakter-Editor das ganze Feld neu.
 */
export const SHEET_NOTE_MAX_CHARS = 160;

/**
 * Budget der ENGLISCHEN Rohfassung: Pass C plant auf Englisch, den Bogen erreicht die
 * übersetzte Zeile. Deutsch ist in dieser Bibliothek gemessen ~17 % länger (102k vs. 120k
 * Zeichen über 249 Klassenmerkmale) — mit Reserve geplant, damit der Übersetzer die harte
 * Grenze halten kann, ohne Mechanik wegzukürzen.
 */
export const SHEET_NOTE_EN_MAX_CHARS = 135;

/**
 * Länge der Konsequenz-Hilfe einer Wahl (Tooltip am Checkpoint). Dieselbe Asymmetrie wie
 * bei der `sheetNote`: geplant wird englisch mit Reserve, gehalten wird die Grenze in der
 * Zielsprache — sonst reißt sie die Übersetzung regelmäßig.
 */
export const CHOICE_HELP_MAX_CHARS = 120;
export const CHOICE_HELP_EN_MAX_CHARS = 105;

/**
 * Eine bereits GETROFFENE Feature-Wahl (nur Protokoll — KEINE Optionslisten mehr).
 *
 * Nur `id` kommt vom Modell: Frage und Antwort füllt der Code aus dem Übersetzungs-Mapping
 * der Analyse (`featureTranslationAction`), das beide schon auf Deutsch kennt. Das Modell
 * danach zu fragen hieße, es dieselbe Zeichenkette ein zweites Mal erzeugen zu lassen.
 */
const featureDecisionSchema = z.object({
  id: z.string().default('').describe('Stable id of the choice, matching the analysis choice id.'),
  question: z.string().default('').describe('Filled in by the app — leave empty.'),
  answer: z.string().default('').describe('Filled in by the app — leave empty.'),
});

/**
 * Ein „Rider" = die Deutung EINES neu gewonnenen Merkmals/Talents — bereits unter
 * Berücksichtigung getroffener Spielerwahlen. Der Rider trägt NUR Ergebnisse und die
 * getroffenen Entscheidungen (`decisions`), KEINE offenen Wahl-Möglichkeiten mehr
 * (die leben transient in der Analyse von Call 1).
 *
 * Es gibt genau EINEN Rider je Merkmal — auch für Merkmale ohne mechanischen Grant, die
 * dann nur `sheetNote` (oder gar nichts) tragen. Guided Decoding erzeugt ohnehin für jedes
 * Merkmal einen Eintrag; ein „nur bei Grant"-Filter wäre eine Fiktion.
 */
const featureRiderSchema = z.object({
  featureName: z.string().default('').describe('Which feature/feat emitted this rider — its ENGLISH name, verbatim from the input.'),
  // Anker für den deutschen Anzeigenamen: der kommt aus der Bibliothek, nicht aus dem Modell
  // — sonst tauchen 2014er-Begriffe auf („Durchschnaufen" statt „Zweiter Wind").
  featureKey: z.string().default('').describe('Library key of the feature, copied verbatim from <gained_features>[].key. Empty only if it carries none.'),
  source: z.enum(['class', 'subclass', 'feat', 'species']).default('class'),
  grantedSpells: z.array(z.string()).default([]).describe('Always-prepared/granted spells, canonical ENGLISH names (already reflecting any resolved choice).'),
  extraCantrips: z.number().int().default(0),
  extraPreparedCount: z.number().int().default(0).describe('Additional spells the player may prepare because of this feature.'),
  expertiseSkills: z.array(z.enum(SKILL_NAMES)).default([]).describe('Skills that gained Expertise — the CHOSEN skills, not options.'),
  proficiencies: riderProficienciesSchema.default({ skills: [], tools: [], weapons: [], armor: [], languages: [], savingThrows: [] }),
  abilityScoreIncrease: abilityDeltaSchema.default({ str: 0, ges: 0, kon: 0, int: 0, wei: 0, cha: 0 }).describe('Ability increases this feature grants — fixed ones AND any resolved "+1 to one of…" choice.'),
  decisions: z.array(featureDecisionSchema).default([]).describe('Feature-forced player choices already MADE (record only — no option lists).'),
  sheetNote: z.string().default('').describe(
    `ENGLISH single-line note for the character sheet: "<feature name>: <what it does>", max ~${SHEET_NOTE_EN_MAX_CHARS} chars ` +
      '(it gets translated into German afterwards, which runs longer). ' +
      'EMPTY when the feature needs no note — purely narrative, or already modelled elsewhere on the sheet.'),
});

export const featureEffectsSchema = z.object({
  riders: z.array(featureRiderSchema).default([]),
});

// ── Deutsche Grenze: die beiden Übersetzungs-Calls ────────────────────────────────
//
// Die Merkmals-Deutung reasont durchgehend ENGLISCH; Deutsch entsteht in zwei
// thinking-off-Calls an den Rändern (`aiActions/featureTranslationAction.ts`). Beide
// Schemas kommen ohne dynamische Objekt-Keys aus: Guided Decoding kann ein
// `Record<string, string>` nicht ausdrücken, deshalb Paar-Arrays — den Record baut TS.

const choiceOptionTranslationSchema = z.object({
  en: z.string().default('').describe('The English option label, copied VERBATIM from the input.'),
  de: z.string().default('').describe('Its German label, quoted verbatim from the feature\'s German rules text.'),
  helpDe: z.string().default('').describe('This option\'s own German consequence, max 60 chars. Empty if it has none.'),
});

const choiceTranslationItemSchema = z.object({
  id: z.string().default('').describe('The choice id, copied VERBATIM from the input.'),
  questionDe: z.string().default('').describe('The German question shown to the player.'),
  helpDe: z.string().default('').describe(`German one-liner on the mechanical trade-off, max ${CHOICE_HELP_MAX_CHARS} chars. Empty if there is none.`),
  options: z.array(choiceOptionTranslationSchema).default([]).describe('One entry per English option, in the SAME order.'),
});

export const choiceTranslationSchema = z.object({
  items: z.array(choiceTranslationItemSchema).default([]).describe('One entry per choice of the input, same order.'),
});

const sheetNoteTranslationSchema = z.object({
  index: z.number().int().default(0).describe('The note\'s index, copied verbatim from the input.'),
  noteDe: z.string().default('').describe(`The German note, max ${SHEET_NOTE_MAX_CHARS} chars, single line.`),
});

export const sheetNoteTranslationsSchema = z.object({
  notes: z.array(sheetNoteTranslationSchema).default([]).describe('One entry per input note, same order.'),
});

// ── Narrativ (dünner KI-Pass; alle Deltas werden deterministisch assembliert) ────
// Bewusst NUR die Zusammenfassung: den Merkmalstext fürs Klassenmerkmale-Feld liefert
// `featureRiderSchema.sheetNote` aus der Merkmals-Deutung — der Pass dort kennt die
// Regelprosa und die getroffenen Wahlen und kann daher besser verdichten als dieser hier.
export const levelUpNarrativeSchema = z.object({
  summary: z.string().default('').describe('GERMAN one-paragraph summary of what changes this level.'),
});

// ── Freitext-Feld eines Charakterbogens (Zusammenfassen/Verschmelzen) ───────────
// Ein Artefakt für alle Aufrufer (Klassenmerkmale, Volksmerkmale, Level-Up-Merge) —
// welches Feld gemeint ist, sagt der Prompt-Input, nicht das Schema.
export const fieldSummarySchema = z.object({
  text: z.string().default('').describe('The FULL revised GERMAN text of the target character-sheet field.'),
});

// ── Gemeinsames Änderungsformat (Single Source für Anzeige UND Anwendung) ────────
// Jede Level-Up-Änderung als uniformer Eintrag mit Quelle (`source`, Key oder
// synthetisch) + deutscher Anzeige (`label`). Discriminated Union über `target`
// hält je Typ die passende Wertform (typsicher). NICHT an ein LLM gesendet →
// keine toLlmJsonSchema-Restriktion; wird deterministisch aus dem State gebaut (buildDoc).
// `step` = ID des Schritts, der diesen Eintrag erzeugt hat (Provenienz). Bewusst
// `string`, KEIN Enum → das Schema bleibt vom Maschinen-Enum (levelUpMachine.ts)
// entkoppelt. Ermöglicht: Protokoll-Gruppierung je Schritt + erneutes Ausführen
// eines Schritts, das per upsertStep NUR dessen Einträge ersetzt (kein Duplikat).
// `source` bleibt orthogonal (Feature-Key / 'hit-dice+kon' / 'asi' / 'class-progression').
const changeBase = { step: z.string().default(''), source: z.string().default(''), label: z.string().default('') };

export const changeSchema = z.discriminatedUnion('target', [
  z.object({ target: z.literal('hpMax'), value: z.number().int(), ...changeBase }),
  z.object({ target: z.literal('hitDice'), value: z.string(), ...changeBase }),
  z.object({ target: z.literal('proficiencyBonus'), value: z.number().int(), ...changeBase }),
  z.object({ target: z.literal('spellSlot'), level: z.number().int(), value: z.number().int(), ...changeBase }),
  z.object({ target: z.literal('cantrip'), name: z.string(), ...changeBase }),
  z.object({ target: z.literal('spellcastingClass'), value: z.string(), ...changeBase }),
  z.object({ target: z.literal('ability'), ability: z.enum(['str', 'ges', 'kon', 'int', 'wei', 'cha']), value: z.number().int(), ...changeBase }),
  z.object({ target: z.literal('preparedSpell'), level: z.number().int(), name: z.string(), prepared: z.boolean().default(true), ...changeBase }),
  z.object({ target: z.literal('feat'), sourceKey: z.string().default(''), name: z.string(), gainedAt: z.number().int().default(1), ...changeBase }),
  z.object({ target: z.literal('expertise'), skill: z.string(), ...changeBase }),
  z.object({ target: z.literal('proficiency'), skill: z.string(), ...changeBase }),
  z.object({ target: z.literal('subclass'), key: z.string(), name: z.string(), ...changeBase }),
  z.object({ target: z.literal('classFeaturesText'), mode: z.enum(['replace', 'append']), value: z.string(), ...changeBase }),
  // Info-Eintrag: neu gewonnenes Merkmal (keine Anwendung, reines Feedback).
  z.object({ target: z.literal('featureGained'), name: z.string(), sourceKey: z.string().default(''), ...changeBase }),
  // Getroffene Aufbau-Entscheidung zu einem Merkmal (z.B. Urtümlicher Orden → Wächter).
  // Landet strukturiert in `character.features[]`, verankert an (sourceKey, gainedAt) —
  // deshalb darf der Klassenmerkmale-Freitext sie weglassen.
  // `choice` = englisches kanonisches Label (Prompt-Kanal), `choiceDe` = Anzeige.
  z.object({ target: z.literal('featureChoice'), sourceKey: z.string(), choice: z.string(), choiceDe: z.string().default(''), gainedAt: z.number().int(), ...changeBase }),
  // Info-Eintrag: Protokoll einer Fragebogen-Antwort ohne eigenes Ziel am Charakter
  // (TP-Methode, Würfelergebnis). Keine mechanische Anwendung.
  z.object({ target: z.literal('note'), value: z.string(), ...changeBase }),
]);

export const levelUpChangeSetSchema = z.object({
  fromLevel: z.number().int().default(0),
  toLevel: z.number().int().default(0),
  klasse: z.string().default(''),
  summary: z.string().default(''), // deutsches Narrativ (KI-Schritt C), rein informativ
  changes: z.array(changeSchema).default([]),
});

export type LevelUpQuestionOption = z.infer<typeof questionOptionSchema>;
export type LevelUpQuestion = z.infer<typeof questionSchema>;
export type Change = z.infer<typeof changeSchema>;
export type LevelUpChangeSet = z.infer<typeof levelUpChangeSetSchema>;
/** Das gemeinsame, akkumulierende LevelUp-Dokument (identisch zum Change-Set). */
export type LevelUpDoc = LevelUpChangeSet;
export type FeatureRider = z.infer<typeof featureRiderSchema>;
export type FeatureEffects = z.infer<typeof featureEffectsSchema>;
export type LevelUpNarrative = z.infer<typeof levelUpNarrativeSchema>;
export type FieldSummary = z.infer<typeof fieldSummarySchema>;
export type ChoiceTranslation = z.infer<typeof choiceTranslationSchema>;
export type ChoiceTranslationItem = z.infer<typeof choiceTranslationItemSchema>;
export type SheetNoteTranslations = z.infer<typeof sheetNoteTranslationsSchema>;

export const featureEffectsJsonSchema = toLlmJsonSchema(featureEffectsSchema);
export const levelUpNarrativeJsonSchema = toLlmJsonSchema(levelUpNarrativeSchema);
export const fieldSummaryJsonSchema = toLlmJsonSchema(fieldSummarySchema);
export const choiceTranslationJsonSchema = toLlmJsonSchema(choiceTranslationSchema);
export const sheetNoteTranslationsJsonSchema = toLlmJsonSchema(sheetNoteTranslationsSchema);

/** Nachsichtiger Guard: parst + füllt Defaults; null bei Schema-Verstoß. */
export function parseLevelUpChangeSet(data: unknown): LevelUpChangeSet | null {
  const r = levelUpChangeSetSchema.safeParse(data);
  return r.success ? r.data : null;
}
export function parseFeatureEffects(data: unknown): FeatureEffects | null {
  const r = featureEffectsSchema.safeParse(data);
  return r.success ? r.data : null;
}
export function parseLevelUpNarrative(data: unknown): LevelUpNarrative | null {
  const r = levelUpNarrativeSchema.safeParse(data);
  return r.success ? r.data : null;
}
export function parseFieldSummary(data: unknown): FieldSummary | null {
  const r = fieldSummarySchema.safeParse(data);
  return r.success ? r.data : null;
}
export function parseChoiceTranslation(data: unknown): ChoiceTranslation | null {
  const r = choiceTranslationSchema.safeParse(data);
  return r.success ? r.data : null;
}
export function parseSheetNoteTranslations(data: unknown): SheetNoteTranslations | null {
  const r = sheetNoteTranslationsSchema.safeParse(data);
  return r.success ? r.data : null;
}
