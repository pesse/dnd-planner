/**
 * Mechanik-gebundene Merkmalswahlen und die Deklarationsfelder, die ein Merkmal aus der
 * KI-Deutung herausnehmen.
 */
import { z } from 'zod';
import { ABILITY_NAMES } from './abilities';
import { castingGrantSchema } from './casting';
import { CHARACTER_PROPERTIES, featureGrantSchema, spellGrantSchema } from './grants';
import { resourceGrantSchema } from './resource';
import { FEAT_CATEGORIES, SKILL_NAMES } from './vocabulary';

/**
 * Die Optionen einer deklarierten Wahl löst der Flow aus der Bibliothek auf, NIE aus der KI —
 * sie könnte hier nur einen erfundenen Kampfstil liefern. Deklarativ statt am Merkmalsnamen,
 * damit Homebrew dieselbe Wahl ohne Code-Änderung gewährt. Was die Feldnamen nicht sagen:
 *   - `weaponMastery`/`spellcasting` IGNORIEREN `count` — Kontingent aus der Stufentabelle.
 *   - `expertise` und `skillProficiency` sind die zwei `kind`s, deren Optionen nicht im Vault
 *     stehen KÖNNEN: sie hängen am Übungsstand — Expertise wählt aus den geübten Fertigkeiten,
 *     `skillProficiency` aus den nicht geübten. Deklariert wird die Anzahl, plus `skills`, wo
 *     die Regel eingrenzt (Magier „Gelehrter").
 *   - `languages` hat gar keine Optionen: Sprachen sind deutscher Freitext, in 2024 nicht
 *     einmal mehr eine Übung. Auch hier deklariert nur `count`, gefragt wird als Freitext.
 *   - `spellcasting` vs. `spellAccess` ist die HERKUNFT der Zahlen, nicht die Mechanik: ein
 *     Talent darf `isSpellcastingFeature` („dies ist das Klassen-Zauberwirken") nicht erfüllen.
 *   - `optionList` trägt die Konsequenz NEBEN jeder Option — das beseitigt den Zustand
 *     „Antwort bekannt, Wirkung offen".
 *   - `optionPool` ist kein `optionList` mit `count > 1`, sondern ein eigener `kind` wegen des
 *     ROUTINGS: ein Pool stellt nie eine Fragebogen-Frage und blockiert nie einen Aufstieg,
 *     er wird wie die Waffenbeherrschung im Editor gepflegt. Als Flag an `optionList` trüge
 *     jedes Prädikat davon eine Ausnahme.
 */
export const FEATURE_CHOICE_KINDS = ['weaponMastery', 'featCategory', 'spellcasting', 'spellAccess', 'optionList', 'optionPool', 'expertise', 'skillProficiency', 'languages', 'characterProperty'] as const;
export type FeatureChoiceKind = (typeof FEATURE_CHOICE_KINDS)[number];

/**
 * Kontingent aus der KLASSEN-Stufentabelle, an Trait oder Talent nicht auflösbar. Damit
 * entscheidet die SENKE, wer was deklarieren darf, nicht die Herkunft — Beweisfall
 * `spellAccess`, dessen einziger Vault-Eintrag ein Talent ist.
 */
export const CLASS_TABLE_CHOICE_KINDS: readonly FeatureChoiceKind[] = [
  'weaponMastery',
  'featCategory',
  'spellcasting',
  'optionPool',
];

/** Ein Gradband eines deklarierten Zauber-Zugangs („zwei Zaubertricks" → level 0, count 2). */
export const spellPickGrantSchema = z.object({
  level: z.number().int().min(0).max(9).describe('Zaubergrad; 0 = Zaubertrick.'),
  count: z.number().int().min(1).describe('Wie viele Zauber dieses Grades gewählt werden.'),
});

export const optionSpellRowSchema = z.object({
  level: z
    .number()
    .int()
    .min(1)
    .max(20)
    .describe('Stufe, ab der die Zauber gelten — Charakterstufe bei Trait/Talent, Klassenstufe am Klassenmerkmal.'),
  names: z.array(z.string()).default([]).describe('Kanonische ENGLISCHE Zaubernamen, wörtlich aus der Tabelle.'),
});
export type OptionSpellRow = z.infer<typeof optionSpellRowSchema>;

/**
 * `value` ist der stabile Schlüssel, auf den die gespeicherte Antwort matcht und der als
 * `<past_choices>` zurückgeht. `labelDe` ist ein ZITAT aus `descDe`, keine Übersetzung.
 */
export const choiceOptionSchema = z.object({
  value: z.string().describe('Englisches Options-Label, wörtlich aus dem Regeltext ("Warden").'),
  labelDe: z.string().default('').describe('Deutsches Anzeige-Label — Zitat aus descDe ("Wächter"). Leer = englisch anzeigen.'),
  helpDe: z.string().default('').describe('Konsequenz DIESER Option, kurz (Richtwert 60 Zeichen).'),
  grants: featureGrantSchema.optional().describe('Was diese Option gewährt. Fehlt = ohne mechanische Wirkung.'),
  // WÖRTLICHE Namen, nicht `grantsSpells`: das zeigt auf EINE Tabelle im `desc` des Trägers,
  // also bekäme jeder Zweig die Zauber aller Zweige.
  spells: z
    .array(optionSpellRowSchema)
    .default([])
    .describe('Benannte Zauber dieser Option je Stufe (Elfenabstammung 1/3/5). Leer = die Option gewährt keine.'),
});
export type ChoiceOption = z.infer<typeof choiceOptionSchema>;

export const featureChoiceGrantSchema = z.object({
  kind: z.enum(FEATURE_CHOICE_KINDS),
  /** Nur bei `kind="optionList"`/`"optionPool"`. Die FRAGE fehlt bewusst — sie ist für jede Zweigwahl dieselbe. */
  options: z.array(choiceOptionSchema).default([]),
  featCategory: z
    .enum(FEAT_CATEGORIES)
    .optional()
    .describe('Nur bei kind="featCategory": aus welcher Talent-Kategorie gewählt wird (z.B. "Fighting Style").'),
  count: z
    .number()
    .int()
    .min(1)
    .default(1)
    .describe('Wie viele Optionen dieses Merkmal gewährt (bei kind="expertise": wie viele Fertigkeiten Expertise erhalten; bei kind="skillProficiency": wie viele Übungen; bei kind="languages": wie viele Sprachen; bei kind="optionPool": wie viele JE Vergabe-Stufe, das Kontingent summiert über alle erreichten). Bei kind="weaponMastery" ignoriert (Kontingent aus der Stufentabelle).'),
  // kind="optionPool": die Spalte SCHLÄGT `gainedAt` × `count`, weil sie die Zahl direkt führt —
  // die Anrufungen des Hexenmeisters kommen alle von EINER Vergabe-Stufe und wären sonst 1.
  column: z
    .string()
    .default('')
    .describe('Nur bei kind="optionPool": Spalte der Klassen-Stufentabelle, die das Kontingent führt ("Eldritch Invocations"). Leer = kumulativ aus gainedAt × count.'),
  skills: z
    .array(z.enum(SKILL_NAMES))
    .default([])
    .describe('Nur bei kind="expertise"/"skillProficiency": Auswahl auf diese Fertigkeiten beschränken (englische SRD-Namen). Leer = keine Eingrenzung.'),
  // kind="spellAccess", beide Listen: LÄNGE 1 = festgelegt, LÄNGE > 1 = protokollierte
  // Entscheidung. Die Deklaration sagt nicht „frag das ab", sondern was zulässig ist — ein
  // Hintergrund, der die Liste vorgibt, fällt so ohne Sonderfall auf „festgelegt" zurück.
  spellLists: z
    .array(z.string())
    .default([])
    .describe('Nur bei kind="spellAccess": Zauberlisten als englische Klassen-Keys ("cleric","druid","wizard").'),
  spellAbilities: z
    .array(z.enum(ABILITY_NAMES))
    .default([])
    .describe('Nur bei kind="spellAccess": zulässige Zauberattribute (englische SRD-Namen).'),
  spellPicks: z
    .array(spellPickGrantSchema)
    .default([])
    .describe('Nur bei kind="spellAccess": wie viele Zauber je Gradband gewählt werden.'),
  // kind="characterProperty". `propertyValues` ist `string[]` und kein Enum: was zulässig ist,
  // hängt an `property`, ein zweites Vokabular hier beantwortete die Frage doppelt. Geprüft
  // wird gegen `characterPropertyOptions`.
  property: z
    .enum(CHARACTER_PROPERTIES)
    .optional()
    .describe('Nur bei kind="characterProperty": welche Grundeigenschaft gewählt wird.'),
  propertyValues: z
    .array(z.string())
    .default([])
    .describe('Nur bei kind="characterProperty": zulässige Werte aus dem Vokabular der Eigenschaft. Leer = alle.'),
});
export type FeatureChoiceGrant = z.infer<typeof featureChoiceGrantSchema>;

/**
 * Ein Merkmal kann MEHRERE Wahlen erzwingen (Waldläufer „Deft Explorer": Expertise + zwei
 * Sprachen). Das Einzelobjekt bleibt gültige Eingabe, damit der Bestand ohne Vault-Sweep
 * weiterliest — gelesen wird immer eine Liste, und die Nachsicht steckt IM Schema, weil ein
 * Normalisierer sonst auf jedem Lesepfad einzeln stünde und auf einem vergessen würde.
 */
export const featureChoiceGrantsSchema = z.preprocess(
  (v) => (v === undefined || Array.isArray(v) ? v : [v]),
  z.array(featureChoiceGrantSchema),
);

/**
 * Eine Feldgruppe statt dreimal einzeln an Klassenmerkmal, Trait und Talent: ein viertes Feld
 * erreicht alle drei Träger von selbst, und die Herkunft entscheidet nur noch über die
 * Bogen-Zeile. Alle drei OPTIONAL OHNE DEFAULT — fehlt = nicht redigiert, `{}` = geprüft.
 */
export const featureDeclarationFields = {
  grants: featureGrantSchema.optional().describe('Deterministisch anwendbare Mechanik des Merkmals.'),
  grantsChoice: featureChoiceGrantsSchema
    .optional()
    .describe('Mechanik-gebundene Wahlen, die das Merkmal gewährt. Einzelobjekt = genau eine.'),
  grantsSpells: spellGrantSchema
    .optional()
    .describe('Immer-vorbereitete Zauberliste; die Namen stehen als Tabelle im desc.'),
  grantsCasting: castingGrantSchema
    .optional()
    .describe('Zauberwirken des Merkmals: Kontingent, Pool, Tauschtakt, Wirk-Ressource.'),
  grantsResource: resourceGrantSchema
    .optional()
    .describe('Vorräte des Merkmals — Einsätze, Punkte, Zauberplätze — und Zuschläge auf fremde.'),
  /** Die Ausnahme von „die Deklaration deckt das GANZE Merkmal ab"; ohne Default wie oben. */
  aiInterpretsRest: z
    .boolean()
    .optional()
    .describe('true = die Deklaration deckt nur EINEN Teil des Merkmals; den Rest deutet die KI. Nur Pass C, nie die Analyse — die stellte die deklarierte Frage sonst ein zweites Mal.'),
} as const;
