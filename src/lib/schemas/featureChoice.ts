/**
 * Mechanik-gebundene Merkmalswahlen und die drei Deklarationsfelder, die ein
 * Merkmal aus der KI-Deutung herausnehmen.
 */
import { z } from 'zod';
import { ABILITY_NAMES } from './abilities';
import { CHARACTER_PROPERTIES, featureGrantSchema, spellGrantSchema } from './grants';
import { FEAT_CATEGORIES } from './vocabulary';

/**
 * Ein Merkmal, dessen Inhalt eine Wahl aus einer FESTEN Regelmenge ist, deklariert sie
 * über `grantsChoice`. Die Optionen löst der Flow dann aus der Bibliothek auf, NIE aus
 * der KI — sie könnte hier nur einen erfundenen Kampfstil liefern. Deklarativ statt am
 * Merkmalsnamen erkannt, damit eine Homebrew-Klasse dieselbe Wahl ohne Code-Änderung
 * gewährt.
 *
 * Was die Feldnamen nicht sagen:
 *   - `weaponMastery` und `spellcasting` IGNORIEREN `count` — ihr Kontingent kommt aus der
 *     Klassen-Stufentabelle (`masteryAllowanceFor`, `spellcastingOffer`).
 *   - `expertise` ist der einzige `kind`, dessen Optionen nicht im Vault stehen KÖNNEN: sie
 *     sind der Übungsstand dieses Charakters, den `buildFeatureEffectsInput` bewusst nicht
 *     mitschickt. Deklariert wird nur die Anzahl.
 *   - `spellcasting` vs. `spellAccess` ist die HERKUNFT der Zahlen, nicht die Mechanik:
 *     ableiten (die Klasse besitzt Tabelle, Liste, Attribut) gegen deklarieren (ein Talent
 *     besitzt davon nichts). Zwei `kind`s, weil `isSpellcastingFeature` „dies ist das
 *     Klassen-Zauberwirken" heißt — ein Talent darf dieses Prädikat nicht wahr machen.
 *   - `optionList` trägt die Konsequenz NEBEN jeder Option (`options[].grants`). Genau das
 *     beseitigt den Zustand „Antwort bekannt, Wirkung offen" — kein Blockieren, keine
 *     Nach-Analyse.
 */
export const FEATURE_CHOICE_KINDS = ['weaponMastery', 'featCategory', 'spellcasting', 'spellAccess', 'optionList', 'expertise', 'characterProperty'] as const;
export type FeatureChoiceKind = (typeof FEATURE_CHOICE_KINDS)[number];

/**
 * Die `kind`s, deren Kontingent aus der KLASSEN-Stufentabelle kommt (`masteryAllowanceFor`,
 * `fightingStyleOffer`, `spellcastingOffer`) — an einem Trait oder Talent nicht auflösbar.
 * Die übrigen tragen ihr Kontingent in der Deklaration selbst und gelten an jedem Träger.
 *
 * Also entscheidet die SENKE, wer was deklarieren darf, nicht die Herkunft: `spellAccess`
 * ist der Beweisfall — sein einziger Vault-Eintrag ist ein Talent.
 */
export const CLASS_TABLE_CHOICE_KINDS: readonly FeatureChoiceKind[] = [
  'weaponMastery',
  'featCategory',
  'spellcasting',
];

/** Ein Gradband eines deklarierten Zauber-Zugangs („zwei Zaubertricks" → level 0, count 2). */
export const spellPickGrantSchema = z.object({
  level: z.number().int().min(0).max(9).describe('Zaubergrad; 0 = Zaubertrick.'),
  count: z.number().int().min(1).describe('Wie viele Zauber dieses Grades gewählt werden.'),
});

/** Eine Stufenzeile der Zauber einer Option: ab dieser Stufe gewährt sie diese Zauber. */
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
 * `value` ist der stabile Schlüssel, auf den die am Charakter gespeicherte Antwort matcht
 * und der als `<past_choices>` zum Modell zurückgeht. `labelDe` ist ein ZITAT aus `descDe`,
 * keine Übersetzung — die deutsche Fassung des Regeltexts hat das Wort schon (**Wächter.**).
 */
export const choiceOptionSchema = z.object({
  value: z.string().describe('Englisches Options-Label, wörtlich aus dem Regeltext ("Warden").'),
  labelDe: z.string().default('').describe('Deutsches Anzeige-Label — Zitat aus descDe ("Wächter"). Leer = englisch anzeigen.'),
  helpDe: z.string().default('').describe('Konsequenz DIESER Option, kurz (Richtwert 60 Zeichen).'),
  grants: featureGrantSchema.optional().describe('Was diese Option gewährt. Fehlt = ohne mechanische Wirkung.'),
  // WÖRTLICHE Namen, nicht `grantsSpells`: das ist ein Zeiger auf eine Tabelle im `desc` des
  // TRÄGERS, und ein Träger hat nur einen — jeder Zweig bekäme die Zauber aller Zweige
  // (Elfenabstammung, Höllische Abstammung: Zeile = Zweig, Spalte = Stufe).
  spells: z
    .array(optionSpellRowSchema)
    .default([])
    .describe('Benannte Zauber dieser Option je Stufe (Elfenabstammung 1/3/5). Leer = die Option gewährt keine.'),
});
export type ChoiceOption = z.infer<typeof choiceOptionSchema>;

export const featureChoiceGrantSchema = z.object({
  kind: z.enum(FEATURE_CHOICE_KINDS),
  /**
   * Nur bei `kind="optionList"`: die Optionen samt Konsequenz. Die FRAGE selbst steht nicht
   * hier — sie ist für jede Zweigwahl dieselbe („Welche Option wählst du?"), und der
   * Merkmalsname sagt bereits, worum es geht.
   */
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
    .describe('Wie viele Optionen dieses Merkmal gewährt (bei kind="expertise": wie viele Fertigkeiten Expertise erhalten). Bei kind="weaponMastery" ignoriert (Kontingent aus der Stufentabelle).'),
  // Die drei Felder von kind="spellAccess". Für beide Listen gilt dieselbe Regel:
  // LÄNGE 1 = festgelegt (keine Frage), LÄNGE > 1 = eine protokollierte Entscheidung.
  // Die Deklaration sagt also nicht „frag das ab", sondern welche Werte zulässig sind —
  // damit fällt ein Hintergrund, der die Liste vorgibt („Weiser" → Magier), ohne
  // Sonderbehandlung auf den festgelegten Fall zurück.
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
  // Die zwei Felder von kind="characterProperty". `propertyValues` ist bewusst `string[]` und
  // kein Enum: welche Werte zulässig sind, hängt an `property`, und ein zweites Vokabular im
  // Schema würde die Frage doppelt beantworten. Geprüft wird gegen die Registry
  // (`characterPropertyOptions`) — unbekannte Werte fallen dort weg, wie bei `spellLists`.
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
 * Die DREI Deklarationen — identisch an `classFeatureSchema`, `traitSchema` und `featSchema`.
 *
 * Als Feldgruppe statt dreimal einzeln, damit Symmetrie strukturell ist: ein viertes Feld
 * erreicht alle drei Träger von selbst. Die Herkunft eines Merkmals entscheidet damit nur
 * noch über seine Bogen-Zeile, nicht über seine Mechanik (services/declaredFeature.ts).
 *
 * Alle drei OPTIONAL OHNE DEFAULT: fehlt das Feld, ist das Merkmal nicht redigiert und läuft
 * weiter über die KI-Kette; `{}` heißt „geprüft, gewährt nichts".
 */
export const featureDeclarationFields = {
  grants: featureGrantSchema.optional().describe('Deterministisch anwendbare Mechanik des Merkmals.'),
  grantsChoice: featureChoiceGrantSchema.optional().describe('Mechanik-gebundene Wahl, die das Merkmal gewährt.'),
  grantsSpells: spellGrantSchema
    .optional()
    .describe('Immer-vorbereitete Zauberliste; die Namen stehen als Tabelle im desc.'),
} as const;
