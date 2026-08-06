/**
 * Schemas des Stufenaufstiegs: KI-Outputs (Bogen-Notizen, Narrativ, Feldtext), das
 * deterministisch gebaute Änderungsdokument und der Rider als internes Transportformat.
 * Bewusst ohne `utils/schemaValidation.ts` — dessen `parse` verlangt ein `name`-Feld, die
 * Runtime-Guards stehen deshalb hier.
 */
import { z } from 'zod';
import { toLlmJsonSchema } from './llmJson';
import { ABILITY_KEYS, ABILITY_NAMES, abilityModsSchema } from './abilities';
import { ARMOR_TRAININGS, MONSTER_SIZE_KEYS, SKILL_NAMES, SPELL_SCHOOL_KEYS, WEAPON_CATEGORIES } from './vocabulary';

export const QUESTION_TYPES = ['choice', 'multiselect', 'number', 'text', 'spell-picker', 'hp-roll'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

const questionOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
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
  spellSchools: z.array(z.enum(SPELL_SCHOOL_KEYS)).default([]).describe('Schul-Filter der Zauberliste; leer = alle.'),
  spellTier: z.enum(['known', 'prepared']).default('prepared').describe('known = die Zauber sind Bestand (Zauberbuch), nicht vorbereitet.'),
  // Nur gesetzt, wenn die Wahl an einer Quota hängt (Merkmals-Zauber-Zugang) — dann routen
  // `cantrip`/`preparedSpell`-Changes dorthin statt in den quellenlosen Bestand.
  sourceId: z.string().default(''),
  quotaId: z.string().default(''),
  // Nur für type "hp-roll": Würfelseiten (Trefferwürfel) + Anzahl Würfe (= gewonnene Stufen).
  dieSides: z.number().int().optional(),
  rollCount: z.number().int().optional(),
  featureKey: z.string().default('').describe('Library key of the feature that forces this choice; empty for questions the flow itself asks.'),
  isBuildDecision: z.boolean().default(false).describe('true = permanent build decision worth recording on the character.'),
});

/** Übungen in derselben Form, in der `proficiencyGrantSchema` sie deklariert. */
const riderProficienciesSchema = z.object({
  skills: z.array(z.enum(SKILL_NAMES)).default([]),
  tools: z.array(z.string()).default([]),
  weapons: z.array(z.enum(WEAPON_CATEGORIES)).default([]),
  armor: z.array(z.enum(ARMOR_TRAININGS)).default([]),
  languages: z.array(z.string()).default([]),
  savingThrows: z.array(z.enum(ABILITY_NAMES)).default([]),
});

export type RiderProficiencies = z.infer<typeof riderProficienciesSchema>;

/**
 * Zwei PDF-Felder à ~700 Zeichen tragen alle Stufen zusammen; unter 160 fällt die
 * Mechanik selbst raus (Aktionsart, Würfel, Wiederaufladung).
 */
export const SHEET_NOTE_MAX_CHARS = 160;

/** Reserve, weil Deutsch ~17 % länger läuft als Englisch: 160 / 1,17. */
export const SHEET_NOTE_EN_MAX_CHARS = 135;

/**
 * Was EIN Merkmal mechanisch gewährt — internes Transportformat, kein Modell-Output: gefüllt
 * wird es aus den Deklarationen des Vaults (`declaration/*`), und die Senken `riderGrantChanges`
 * / `abilityFromRiders` sind über seine Felder total. Zwei Felder haben derzeit KEINEN
 * Produzenten (`proficiencies.tools`, `abilityScoreIncrease`) — die Deklarationsform dafür fehlt
 * noch (#30, #31); sie stehen hier, damit deren Senke schon fertig ist.
 */
const featureRiderSchema = z.object({
  featureName: z.string().default(''),
  featureKey: z.string().default(''),
  source: z.enum(['class', 'subclass', 'feat', 'species']).default('class'),
  grantedSpells: z.array(z.string()).default([]).describe('Immer-vorbereitete/gewährte Zauber, kanonische ENGLISCHE Namen.'),
  extraCantrips: z.number().int().default(0),
  extraPreparedCount: z.number().int().default(0),
  expertiseSkills: z.array(z.enum(SKILL_NAMES)).default([]),
  proficiencies: riderProficienciesSchema.default({ skills: [], tools: [], weapons: [], armor: [], languages: [], savingThrows: [] }),
  abilityScoreIncrease: abilityModsSchema,
});

/**
 * Der EINZIGE Merkmals-Output des Modells: je Merkmal eine Bogenzeile. Wahlen und
 * Zaubergewährung kommen aus der Deklaration, nicht von hier — ein `featureKey`, den der
 * Eingang nicht enthielt, gehört zu keinem Merkmal und wird verworfen.
 */
const featureNoteSchema = z.object({
  featureName: z.string().default('').describe('Which feature this note belongs to — its ENGLISH name, verbatim from the input.'),
  // Anker für den deutschen Anzeigenamen aus der Bibliothek; aus dem Modell kämen
  // 2014er-Begriffe („Durchschnaufen" statt „Zweiter Wind").
  featureKey: z.string().default('').describe('Library key of the feature, copied verbatim from <gained_features>[].key. Empty only if it carries none.'),
  sheetNote: z.string().default('').describe(
    `ENGLISH single-line note for the character sheet: "<feature name>: <what it does>", max ~${SHEET_NOTE_EN_MAX_CHARS} chars ` +
      '(it gets translated into German afterwards, which runs longer). ' +
      'EMPTY when the feature needs no note — purely narrative, or already modelled elsewhere on the sheet.'),
});

export const featureNotesSchema = z.object({
  notes: z.array(featureNoteSchema).default([]),
});

const sheetNoteTranslationSchema = z.object({
  index: z.number().int().default(0).describe('The note\'s index, copied verbatim from the input.'),
  noteDe: z.string().default('').describe(`The German note, max ${SHEET_NOTE_MAX_CHARS} chars, single line.`),
});

export const sheetNoteTranslationsSchema = z.object({
  notes: z.array(sheetNoteTranslationSchema).default([]).describe('One entry per input note, same order.'),
});

/**
 * Bewusst NUR die Zusammenfassung: den Merkmalstext liefert `featureNoteSchema.sheetNote`,
 * dessen Pass Regelprosa und getroffene Wahlen kennt und besser verdichtet als dieser hier.
 */
export const levelUpNarrativeSchema = z.object({
  summary: z.string().default('').describe('GERMAN one-paragraph summary of what changes this level.'),
});

/** Ein Artefakt für alle Aufrufer — welches Feld gemeint ist, sagt der Prompt-Input. */
export const fieldSummarySchema = z.object({
  text: z.string().default('').describe('The FULL revised GERMAN text of the target character-sheet field.'),
});

/**
 * Geht NICHT an ein LLM (keine toLlmJsonSchema-Restriktion), sondern wird deterministisch
 * aus dem Zustand gebaut. `step` ist bewusst `string` statt Enum — das hält das Schema vom
 * Schritt-Enum des Ablaufs entkoppelt und lässt `upsertStep` genau dessen Einträge ersetzen.
 */
const changeBase = { step: z.string().default(''), source: z.string().default(''), label: z.string().default('') };

export const changeSchema = z.discriminatedUnion('target', [
  z.object({ target: z.literal('hpMax'), value: z.number().int(), ...changeBase }),
  z.object({ target: z.literal('hitDice'), value: z.string(), ...changeBase }),
  z.object({ target: z.literal('proficiencyBonus'), value: z.number().int(), ...changeBase }),
  z.object({ target: z.literal('spellSlot'), level: z.number().int(), value: z.number().int(), ...changeBase }),
  // `key`/`sourceId`/`quotaId` fehlen, wenn der Aufrufer sie nicht kennt (KI-Rider, Stufentabelle) —
  // dann bleibt es beim quellenlosen Bestand (`applyChanges.ts`).
  z.object({ target: z.literal('cantrip'), name: z.string(), key: z.string().optional(), sourceId: z.string().optional(), quotaId: z.string().optional(), ...changeBase }),
  z.object({ target: z.literal('spellcastingClass'), value: z.string(), ...changeBase }),
  z.object({ target: z.literal('ability'), ability: z.enum(ABILITY_KEYS), value: z.number().int(), ...changeBase }),
  z.object({ target: z.literal('preparedSpell'), level: z.number().int(), name: z.string(), key: z.string().optional(), sourceId: z.string().optional(), quotaId: z.string().optional(), prepared: z.boolean().default(true), ...changeBase }),
  z.object({ target: z.literal('feat'), sourceKey: z.string().default(''), name: z.string(), gainedAt: z.number().int().default(1), ...changeBase }),
  z.object({ target: z.literal('expertise'), skill: z.enum(SKILL_NAMES), ...changeBase }),
  z.object({ target: z.literal('proficiency'), skill: z.enum(SKILL_NAMES), ...changeBase }),
  z.object({ target: z.literal('weaponProficiency'), value: z.enum(WEAPON_CATEGORIES), ...changeBase }),
  z.object({ target: z.literal('armorTraining'), value: z.enum(ARMOR_TRAININGS), ...changeBase }),
  z.object({ target: z.literal('savingThrow'), value: z.enum(ABILITY_NAMES), ...changeBase }),
  z.object({ target: z.literal('toolProficiency'), value: z.string(), ...changeBase }),
  z.object({ target: z.literal('language'), value: z.string(), ...changeBase }),
  z.object({ target: z.literal('sizeCategory'), value: z.enum(MONSTER_SIZE_KEYS), ...changeBase }),
  z.object({ target: z.literal('speedFeet'), value: z.number().int(), ...changeBase }),
  // „Martial weapons that have the Light property" — Text, kein Flag: das Vokabular kann
  // die Einschränkung nicht ausdrücken, der Bogen führt sie als Freitextzeile.
  z.object({ target: z.literal('weaponProficiencyOther'), value: z.string(), ...changeBase }),
  z.object({ target: z.literal('subclass'), key: z.string(), name: z.string(), ...changeBase }),
  z.object({ target: z.literal('classFeaturesText'), mode: z.enum(['replace', 'append']), value: z.string(), ...changeBase }),
  // Reines Feedback, keine Anwendung am Charakter.
  z.object({ target: z.literal('featureGained'), name: z.string(), sourceKey: z.string().default(''), ...changeBase }),
  // Landet strukturiert in `character.features[]` — deshalb darf der Klassenmerkmale-Freitext die
  // Wahl weglassen. `choice` = englisches kanonisches Label (Prompt-Kanal), `choiceDe` = Anzeige,
  // `choiceId` = die Frage (`LevelUpQuestion.id`) und damit der Upsert-Schlüssel im Ledger.
  z.object({ target: z.literal('featureChoice'), sourceKey: z.string(), choiceId: z.string().default(''), choice: z.string(), choiceDe: z.string().default(''), gainedAt: z.number().int(), ...changeBase }),
  // Protokoll einer Antwort ohne eigenes Ziel am Charakter (TP-Methode, Würfelergebnis).
  z.object({ target: z.literal('note'), value: z.string(), ...changeBase }),
]);

export const levelUpChangeSetSchema = z.object({
  fromLevel: z.number().int().default(0),
  toLevel: z.number().int().default(0),
  klasse: z.string().default(''),
  summary: z.string().default(''), // rein informativ
  changes: z.array(changeSchema).default([]),
});

export type LevelUpQuestionOption = z.infer<typeof questionOptionSchema>;
export type LevelUpQuestion = z.infer<typeof questionSchema>;
export type Change = z.infer<typeof changeSchema>;
export type LevelUpChangeSet = z.infer<typeof levelUpChangeSetSchema>;
export type LevelUpDoc = LevelUpChangeSet;
export type FeatureRider = z.infer<typeof featureRiderSchema>;
export type FeatureNote = z.infer<typeof featureNoteSchema>;
export type FeatureNotes = z.infer<typeof featureNotesSchema>;
export type LevelUpNarrative = z.infer<typeof levelUpNarrativeSchema>;
export type FieldSummary = z.infer<typeof fieldSummarySchema>;
export type SheetNoteTranslations = z.infer<typeof sheetNoteTranslationsSchema>;

export const featureNotesJsonSchema = toLlmJsonSchema(featureNotesSchema);
export const levelUpNarrativeJsonSchema = toLlmJsonSchema(levelUpNarrativeSchema);
export const fieldSummaryJsonSchema = toLlmJsonSchema(fieldSummarySchema);
export const sheetNoteTranslationsJsonSchema = toLlmJsonSchema(sheetNoteTranslationsSchema);

export function parseLevelUpChangeSet(data: unknown): LevelUpChangeSet | null {
  const r = levelUpChangeSetSchema.safeParse(data);
  return r.success ? r.data : null;
}
export function parseFeatureNotes(data: unknown): FeatureNotes | null {
  const r = featureNotesSchema.safeParse(data);
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
export function parseSheetNoteTranslations(data: unknown): SheetNoteTranslations | null {
  const r = sheetNoteTranslationsSchema.safeParse(data);
  return r.success ? r.data : null;
}
