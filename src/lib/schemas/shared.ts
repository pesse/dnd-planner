/**
 * Gemeinsame Bausteine für die Entity-Schemas (Single Source of Truth).
 *
 * Pro Entität gibt es genau EIN Zod-Schema. Daraus werden drei Sichten abgeleitet:
 *   1) TS-Type            → `z.infer<typeof schema>`
 *   2) Runtime-Validator  → `schema.safeParse()` (nachsichtig: füllt Defaults, strippt
 *                            Unbekanntes — siehe schemaValidation.ts)
 *   3) LLM-JSON-Schema     → `toLlmJsonSchema(schema)` (strikt: vollständiger Output)
 */
import { z } from 'zod';

/**
 * `{ index, name }`-Referenzobjekt (Schadenstyp, Equipment-Kategorie, …).
 *
 * Bewusst eine Factory (frische Instanz pro Aufruf), damit `z.toJSONSchema`
 * die Definition INLINE ausgibt statt sie über `$ref`/`$defs` zu deduplizieren —
 * Anthropics Structured-Outputs erwartet das aufgelöste Schema.
 */
export const namedRef = (desc?: string) => {
  const s = z.object({ index: z.string(), name: z.string() });
  return desc ? s.describe(desc) : s;
};

// ── Herkunft ──────────────────────────────────────────────────────────────────
//
// Die Herkunftswerte, siehe vault/CLAUDE.md. Sie steuern, in welchen verteilbaren
// Pack eine Datei fällt (vault/libraries.yaml, fail-closed), sind der
// `document.key` der Open5e-Artefakte und zugleich das Präfix jedes Main-Keys
// ("srd-2024_alert", "homebrew-sam_runenhammer"). Ein anderer Wert lässt den
// Pack-Build abbrechen.
//
// Neben den drei Kern-Werten (srd-2024/phb-2024/homebrew-sam) tragen einige
// Zauber Fremd-/Legacy-Herkünfte: `dndapi-2014` (Alt-Bestand aus dem früheren
// dnd5eapi-Import, nicht in Open5e-2024), `srd-2014`, `deepm` (Kobold Press) und
// `a5e-ag` (Level Up A5E) — 2024er Open5e führt diese Zauber nicht.

export const SOURCE_KEYS = [
  'srd-2024',
  'phb-2024',
  'homebrew-sam',
  // Fremd-/Legacy-Herkünfte (nur Zauber, die Open5e-2024 nicht führt):
  'dndapi-2014',
  'srd-2014',
  'deepm',
  'a5e-ag',
] as const;
export type SourceKey = (typeof SOURCE_KEYS)[number];

/** Default für alles, was in der App neu entsteht. */
export const OWN_SOURCE: SourceKey = 'homebrew-sam';

export const SOURCE_LABELS: Record<SourceKey, string> = {
  'srd-2024': 'SRD 5.2',
  'phb-2024': 'PHB 2024',
  'homebrew-sam': 'Eigen',
  'dndapi-2014': 'D&D API 2014',
  'srd-2014': 'SRD 5.1',
  deepm: 'Deep Magic',
  'a5e-ag': 'Level Up A5E',
};

/** Anzeigename einer Herkunft; unbekannte Werte (Fremdimport) unverändert durchreichen. */
export function sourceLabel(source: string | undefined): string {
  return SOURCE_LABELS[source as SourceKey] ?? source ?? '';
}

/**
 * Das `source`-Feld für ein Entity-Schema.
 *
 * Bewusst `z.enum` statt Freitext: so kann ein LLM gar keinen erfundenen Wert
 * liefern, und ein falsch gepflegter Editor fällt schon im Parse-Gate auf statt
 * erst im Pack-Build. Altbestand fängt `migrateSourceLegacy` ab, das vor jedem
 * Parse läuft.
 */
export const sourceField = () =>
  z.enum(SOURCE_KEYS).default(OWN_SOURCE).describe('Herkunft: SRD 5.2, PHB 2024 oder eigenes Material.');

// Bis Juli 2026 gültige Herkunftsangaben. `document.key` trug schon die neuen
// Werte, `source` eine eigene, uneinheitliche Liste.
const LEGACY_SOURCES: Record<string, SourceKey> = {
  SRD: 'srd-2024',
  'PHB-2024 (kein SRD)': 'phb-2024',
  eigen: 'homebrew-sam',
  KI: 'homebrew-sam',
  Homebrew: 'homebrew-sam',
  homebrew: 'homebrew-sam',
};

/**
 * Beliebige Herkunftsangabe → einer der gültigen `SOURCE_KEYS`.
 *
 * Bekannte Fremd-/Legacy-Dokumente (`srd-2014`, `deepm`, `a5e-ag`) stehen jetzt
 * selbst in `SOURCE_KEYS` und werden unverändert durchgereicht (eigene Libraries,
 * siehe libraries.yaml). Wirklich Unbekanntes (leer, sonstiger Fremdimport) fällt
 * weiterhin auf `homebrew-sam` — die sichere Richtung: der Pack ist codiert, das
 * Material landet also nie ungeprüft in einer offenen Library.
 */
export function toSourceKey(raw: string | undefined | null): SourceKey {
  const s = raw ?? '';
  if (LEGACY_SOURCES[s]) return LEGACY_SOURCES[s];
  return (SOURCE_KEYS as readonly string[]).includes(s) ? (s as SourceKey) : OWN_SOURCE;
}

/**
 * Bringt die Herkunft eines eingelesenen Artefakts auf das aktuelle Vokabular.
 * Fehlt `source` ganz, springt `document.key` ein (Open5e-Artefakte trugen die
 * Herkunft früher nur dort); sonst gilt der Default.
 */
export function migrateSourceLegacy(raw: Record<string, unknown>): Record<string, unknown> {
  const doc = raw.document as { key?: unknown } | undefined;
  const current =
    typeof raw.source === 'string' && raw.source
      ? raw.source
      : typeof doc?.key === 'string'
        ? doc.key
        : '';
  const next = toSourceKey(current);

  raw.source = next;
  // `document.key` ist dasselbe Merkmal in zweiter Ausfertigung — mitziehen,
  // sonst weist der Pack-Build die Datei wegen Widerspruchs ab.
  if (doc && typeof doc === 'object' && doc.key) (doc as { key: string }).key = next;
  return raw;
}

// ── Serialisierung in den Vault ───────────────────────────────────────────────
//
// Die Herkunft hängt nicht am Artefakt, sondern an seinem Ablageort:
//
//   akt-lokal (campaigns/*/acts/*/monsters/)  → KEIN `source`
//   Bibliothek (vault/monsters/, spells/, …)  → genau ein gültiger `source`
//
// Akt-lokales Material wird nie als Bibliothek verteilt, sondern nur mit seiner
// Kampagne — die Herkunftsfrage stellt sich dort nicht. Erst die Übernahme in
// die Bibliothek vergibt eine. Siehe vault/CLAUDE.md.

/** Akt-lokales Artefakt: ohne Herkunft ablegen. */
export function toActLocalJson(entity: unknown): string {
  const obj = { ...(entity as Record<string, unknown>) };
  delete obj.source;
  return JSON.stringify(obj, null, 2);
}

/**
 * Bibliotheks-Artefakt: mit gültiger Herkunft ablegen.
 *
 * Setzt `source` an Ort und Stelle (Feldreihenfolge bleibt erhalten) und
 * normalisiert dabei Altwerte. Wer eine bestimmte Herkunft erzwingen will —
 * etwa die Übernahme aus einem Akt — übergibt sie mitsamt dem Artefakt.
 */
export function toLibraryJson(entity: unknown): string {
  const obj = { ...(entity as Record<string, unknown>) };
  obj.source = toSourceKey(obj.source as string);
  return JSON.stringify(obj, null, 2);
}

/** Legacy-Main-Keys mitziehen: "homebrew_alarm" → "homebrew-sam_alarm". */
export function migrateSourceKey(key: string | undefined): string {
  return key?.startsWith('homebrew_') ? `${OWN_SOURCE}_${key.slice('homebrew_'.length)}` : (key ?? '');
}

// ── Geschlossene Regel-Vokabulare (Übungen) ───────────────────────────────────
//
// **Grundmechanik ist immer englisch.** Übungen sind in 5e 2024 geschlossene
// Vokabulare (18 Fertigkeiten, 6 Rettungswürfe, 2 Waffenkategorien, 4 Rüstungs-
// stufen) — die Bibliotheks-Artefakte tragen sie in SRD-Schreibweise. Der
// Charakterbogen (`character.skills`, `*SaveProf`, `proficiencies.*`) bleibt
// deutsch, weil das PDF-Formular die Feldnamen diktiert. Zwischen beidem liegt
// GENAU EINE Übersetzungstabelle: `SKILL_DEFS.en` (pdf/characterFields.ts) und
// `ABILITY_FROM_EN`/`ABILITY_TO_EN` (services/classProgression.ts).

export const SKILL_NAMES = [
  'Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception',
  'History', 'Insight', 'Intimidation', 'Investigation', 'Medicine',
  'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion',
  'Sleight of Hand', 'Stealth', 'Survival',
] as const;
export type SkillName = (typeof SKILL_NAMES)[number];

export const ABILITY_NAMES = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'] as const;
export type AbilityName = (typeof ABILITY_NAMES)[number];

export const WEAPON_CATEGORIES = ['Simple', 'Martial'] as const;
export type WeaponCategory = (typeof WEAPON_CATEGORIES)[number];

export const ARMOR_TRAININGS = ['Light', 'Medium', 'Heavy', 'Shields'] as const;
export type ArmorTraining = (typeof ARMOR_TRAININGS)[number];

/**
 * Die acht Meisterschaftseigenschaften (Weapon Mastery, 5e 2024). Jede Waffe trägt
 * genau eine; fünf Klassen dürfen die von N Waffenarten ihrer Wahl nutzen.
 *
 * Wie bei `sourceField()` bewusst ein Enum statt Freitext: so kann ein LLM keinen
 * erfundenen Wert liefern. Deutsche Namen und Regeltexte liegen in
 * `itemLibrary.ts` (`MASTERY_INFO`) — hier steht nur das Vokabular, damit Zod es
 * ohne Umweg über die Anzeige-Schicht nutzen kann.
 */
export const WEAPON_MASTERIES = ['Cleave', 'Graze', 'Nick', 'Push', 'Sap', 'Slow', 'Topple', 'Vex'] as const;
export type WeaponMastery = (typeof WEAPON_MASTERIES)[number];

/**
 * Die vier Talent-Kategorien aus 5e 2024. Sie entscheiden, WANN ein Talent
 * genommen werden darf: Origin beim Hintergrund, General ab Stufe 4 (statt einer
 * Attributserhöhung), Fighting Style nur mit dem gleichnamigen Klassenmerkmal,
 * Epic Boon ab Stufe 19.
 *
 * Open5e nennt das Feld `type`; hier heißt es `category`, weil `type` im Rest der
 * App schon die Artefaktart bezeichnet (`activeFile.type`). Deutsche Labels in
 * `featsLibrary.ts` (`FEAT_CATEGORY_DE`) — hier steht nur das Vokabular, damit Zod
 * es ohne Umweg über die Anzeige-Schicht nutzen kann.
 */
export const FEAT_CATEGORIES = ['Origin', 'General', 'Fighting Style', 'Epic Boon'] as const;
export type FeatCategory = (typeof FEAT_CATEGORIES)[number];


/**
 * Immer-vorbereitete Zauberliste eines Merkmals (Kreis-, Domänen-, Eid-, Patronenzauber).
 *
 * `kind` ist ein Diskriminator über die in `grantedSpells.ts` implementierten Formen, KEIN
 * Parse-Rezept — ein Regex im Content wäre Code im Inhalt. Die Zaubernamen selbst stehen nur
 * in der Tabelle im `desc`; eine zweite Fassung im JSON liefe auseinander.
 * `levelTable` = Zeilen `|Stufe|Zauber, Zauber|`, mehrere Tabellen werden vereinigt.
 */
export const SPELL_GRANT_KINDS = ['levelTable'] as const;
export type SpellGrantKind = (typeof SPELL_GRANT_KINDS)[number];

export const spellGrantSchema = z.object({
  kind: z.enum(SPELL_GRANT_KINDS).describe('Form, in der die Liste im Merkmalstext steht.'),
});
export type SpellGrant = z.infer<typeof spellGrantSchema>;

/** Wahl-fähiger Fertigkeits-Grant. `from: []` bei `choose > 0` = beliebige Fertigkeit. */
export const skillGrantSchema = z.object({
  fixed: z.array(z.enum(SKILL_NAMES)).default([]).describe('Ohne Wahl gewährte Fertigkeiten.'),
  choose: z.number().int().min(0).default(0).describe('Wie viele Fertigkeiten frei gewählt werden.'),
  from: z.array(z.enum(SKILL_NAMES)).default([]).describe('Auswahlliste; leer = beliebige Fertigkeit.'),
});

/** Leerer Fertigkeits-Grant (Default-Literal, damit `z.toJSONSchema` es inline auflöst). */
export const emptySkillGrant = (): SkillGrant => ({ fixed: [], choose: 0, from: [] });

/**
 * Was ein Bibliotheks-Artefakt an Übungen gewährt — EINE Form für alle vier
 * Artefakttypen (Klasse, Hintergrund, Spezies-Merkmal, Talent). Genau das ist
 * der Punkt: die Summierung über alle Quellen ist dann eine Funktion, nicht vier
 * (services/proficiencyGrants.ts). Hintergründe füllen nur `skills`, Klassen alles.
 */
export const proficiencyGrantSchema = z.object({
  skills: skillGrantSchema.default(emptySkillGrant),
  savingThrows: z.array(z.enum(ABILITY_NAMES)).default([]),
  weapons: z.array(z.enum(WEAPON_CATEGORIES)).default([]),
  weaponsOther: z
    .array(z.string())
    .default([])
    .describe('Waffen-Übungen außerhalb der zwei Kategorien, z.B. "Martial weapons that have the Light property".'),
  armor: z.array(z.enum(ARMOR_TRAININGS)).default([]),
});

/** Leerer Übungs-Grant (Default-Literal für `.default()`). */
export const emptyProficiencyGrant = (): ProficiencyGrant => ({
  skills: emptySkillGrant(),
  savingThrows: [],
  weapons: [],
  weaponsOther: [],
  armor: [],
});

export type SkillGrant = z.infer<typeof skillGrantSchema>;
export type ProficiencyGrant = z.infer<typeof proficiencyGrantSchema>;

/**
 * Fortlaufende, PRO CHARAKTERSTUFE wirkende Zunahme. Heute nur das TP-Maximum
 * (Zwergische Zähigkeit +1, Talent „Zäh" +2) — als Objekt statt als Zahl, damit ein
 * zweites Ziel keine Schemamigration braucht.
 *
 * NICHT der Einmal-Schub beim Erwerb („um das Doppelte deiner Charakterstufe"): der ist
 * eine Funktion der Stufe, nicht ein Wert je Stufe, und der Aufstieg wendet nur diesen hier
 * (× gewonnene Stufen) an.
 */
export const perLevelGrantSchema = z.object({
  hpMax: z.number().int().default(0).describe('Zunahme des TP-Maximums je Charakterstufe.'),
});

/** Leerer pro-Stufe-Grant (Default-Literal für `.default()`). */
export const emptyPerLevelGrant = (): PerLevelGrant => ({ hpMax: 0 });

/**
 * Was ein Merkmal deterministisch GEWÄHRT — dritte Deklaration neben `grantsChoice`
 * (Wahlen) und `grantsSpells` (immer-vorbereitete Listen). Alle drei haben denselben
 * Zweck: das Merkmal aus der KI-Deutung herausnehmen, weil sein Inhalt als Daten vorliegt.
 *
 * An `classFeatureSchema`/`traitSchema`/`featSchema` bewusst OPTIONAL OHNE DEFAULT: fehlt
 * das Feld, ist das Merkmal nicht redigiert und läuft weiter über die KI-Kette; ein leeres
 * `{}` heißt „geprüft, gewährt nichts". Ohne diese Unterscheidung wäre jede Deckungslücke
 * still — ein Homebrew- oder frisch importiertes Merkmal verlöre seine Mechanik unbemerkt.
 *
 * Wächst mit der Abdeckung (Übungen, Attributserhöhung, Zauber-Kontingente); heute trägt es
 * nur, was auch ausgewertet wird.
 */
export const featureGrantSchema = z.object({
  /**
   * Übungen in derselben Form wie an Klasse/Hintergrund/Spezies/Talent — genau darum ist die
   * Summierung über alle Quellen EINE Funktion (services/proficiencyGrants.ts).
   *
   * `skills.choose` ist erlaubt und wird benutzt (Elf „Keen Senses", Talent „Skilled"), aber
   * von einer ANDEREN Senke: `collectGrants` stellt die Frage im Fertigkeitsschritt, während
   * `withGrant`/`proficiencyGrantChanges` nur `skills.fixed` anwenden. Die beiden Wege sind
   * disjunkt — eine offene Wahl wird gefragt, ein fester Grant gesetzt.
   */
  proficiencies: proficiencyGrantSchema.default(emptyProficiencyGrant),
  extraCantrips: z.number().int().default(0).describe('Zusätzlich FREI wählbare Zaubertricks („einen zusätzlichen Zaubertrick aus der Druiden-Zauberliste").'),
  extraPreparedCount: z.number().int().default(0).describe('Zusätzlich vorbereitbare Zauber über die Stufentabelle hinaus.'),
  perLevel: perLevelGrantSchema.default(emptyPerLevelGrant),
});

/** true, wenn der Grant nichts gewährt. */
export function isEmptyProficiencyGrant(g: ProficiencyGrant | undefined): boolean {
  if (!g) return true;
  return (
    !g.skills.fixed.length && !g.skills.choose &&
    !g.savingThrows.length && !g.weapons.length && !g.weaponsOther.length && !g.armor.length
  );
}

export type PerLevelGrant = z.infer<typeof perLevelGrantSchema>;
export type FeatureGrant = z.infer<typeof featureGrantSchema>;

/**
 * Mechanik-gebundene Merkmalswahlen: Klassenmerkmale, deren einziger Inhalt eine Wahl aus
 * einer FESTEN Regelmenge ist (Waffenbeherrschung, Kampfstil). Das Klassenmerkmal DEKLARIERT
 * die Wahl über `grantsChoice` (classFeatureSchema) — der Aufstiegs-/Wizard-Flow löst die
 * Optionen dann aus der Bibliothek auf, NIE aus der KI. Genau das schützt vor Halluzination:
 * die KI könnte hier nur einen erfundenen Kampfstil/eine erfundene Waffe liefern.
 *
 * Deklarativ statt am Merkmals-Key erkannt, damit eine Homebrew-Klasse dieselbe Wahl gewährt,
 * indem sie das Feld setzt — ohne Code-Änderung. Wie `item.mastery` und `feat.category` ein
 * strukturiertes Feld am Inhalt, keine Namensheuristik.
 *
 *   - `weaponMastery`: Waffenbeherrschung. `count` wird IGNORIERT — das Kontingent kommt aus
 *     der Stufentabelle (`masteryAllowanceFor`, services/weaponMastery.ts).
 *   - `featCategory`: Wahl eines Talents aus `featCategory` (heute nur „Fighting Style"). `count`
 *     = wie viele Talente dieses eine Merkmal gewährt (i.d.R. 1).
 *   - `spellcasting`: das Zauberwirken-Merkmal selbst („Spellcasting", „Pact Magic"). `count`
 *     wird IGNORIERT — Zaubertricks und vorbereitete Zauber kommen aus der Stufentabelle
 *     (`spellcastingOffer`, services/spellcasting.ts), die Optionen aus `vault/spells`.
 *   - `spellAccess`: ein Zauber-Zugang NEBEN dem Klassen-Zauberwirken („Eingeweihter der Magie").
 *     Liste, Attribut und Kontingent stehen in `spellLists`/`spellAbilities`/`spellPicks`.
 *   - `expertise`: Expertise in `count` der GEÜBTEN Fertigkeiten. Der einzige `kind`, dessen
 *     Optionen nicht im Vault stehen können — sie sind der Übungsstand DIESES Charakters.
 *     Deklariert wird nur die Anzahl; die Liste baut der Flow zur Laufzeit. Genau deshalb
 *     konnte die KI hier nie liefern: `buildFeatureEffectsInput` schickt bewusst keine
 *     Charakter-Zusammenfassung mit, das Modell kennt die geübten Fertigkeiten also nicht.
 *   - `optionList`: die generische Zweigwahl — das Merkmal bietet eine im Regeltext
 *     ausgeschriebene Optionsliste an (Urtümlicher Orden, Göttlicher Orden), und JEDE Option
 *     trägt ihre Konsequenz neben sich (`options[].grants`). Genau das macht die Wahl
 *     deterministisch: es gibt keinen Zustand „Antwort bekannt, Wirkung noch offen" mehr,
 *     also auch kein Blockieren und keine Nach-Analyse.
 *
 * Der Unterschied zwischen den beiden Zauber-Arten ist die HERKUNFT der Zahlen, nicht die
 * Mechanik: `spellcasting` heißt ABLEITEN (die Klasse besitzt Stufentabelle, Liste und
 * Attribut), `spellAccess` heißt DEKLARIEREN (ein Talent hat davon nichts, also steht alles
 * hier). Zwei `kind`s statt Parametern am ersten, weil `isSpellcastingFeature`
 * (services/spellcasting.ts) „dies ist das Klassen-Zauberwirken" bedeutet und über
 * `spellcastingOffer` entscheidet — ein Talent darf dieses Prädikat nicht wahr machen.
 */
export const FEATURE_CHOICE_KINDS = ['weaponMastery', 'featCategory', 'spellcasting', 'spellAccess', 'optionList', 'expertise'] as const;
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

/**
 * Eine Option einer `optionList`-Wahl. Der Kern ist, dass die KONSEQUENZ neben der Option
 * steht — dann kann die Wahl nichts mehr „bestimmen, was erst danach feststeht".
 *
 * `value` ist der stabile Schlüssel (englisches Label, WÖRTLICH aus dem Regeltext, wie
 * Pass A es verlangte): darauf matcht die am Charakter gespeicherte Antwort, und so kommt
 * sie als `<past_choices>` zurück. `labelDe` ist ein ZITAT aus `descDe` — keine Übersetzung;
 * die deutsche Fassung des Regeltexts hat das Wort schon (**Wächter.**).
 */
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

/**
 * Altformat: die Übungs-Senke stand als `proficiencyGrant` NEBEN der Deklaration; jetzt darin
 * (`grants.proficiencies`). Betrifft Speziesmerkmale und Talente — am Klassenkopf und am
 * Hintergrund bleibt `proficiencyGrant`, dort ist es kein Merkmal.
 *
 * Das Altfeld wird GELÖSCHT, damit keine zweite Wahrheit zurückbleibt; eine vorhandene
 * Deklaration gewinnt. Muss auf JEDEM Lesepfad laufen: `traitSchema`/`featSchema` sind nicht
 * `strict`, ein vergessener Pfad verliert die Übung also stumm statt mit Parse-Fehler.
 */
export function foldLegacyProficiencyGrant(obj: Record<string, unknown>): Record<string, unknown> {
  const legacy = obj.proficiencyGrant;
  delete obj.proficiencyGrant;
  const parsed = proficiencyGrantSchema.safeParse(legacy);
  if (!parsed.success || isEmptyProficiencyGrant(parsed.data)) return obj;

  const grants = (obj.grants ?? {}) as Record<string, unknown>;
  if (isEmptyProficiencyGrant(proficiencyGrantSchema.safeParse(grants.proficiencies).data)) {
    grants.proficiencies = parsed.data;
    obj.grants = grants;
  }
  return obj;
}

/**
 * Lookup-Schlüssel eines Regelbegriffs: kleingeschrieben, OHNE jedes Leerzeichen.
 * Fängt Open5es Datenmüll ab — die v2-Kerntabellen enthalten „Na ture" (Druide)
 * und „In sight" (Magier), also eingestreute Leerzeichen mitten im Namen.
 */
const foldRuleName = (s: string): string => s.toLowerCase().replace(/\s+/g, '');

function vocabularyLookup<T extends string>(values: readonly T[]): Map<string, T> {
  return new Map(values.map((v) => [foldRuleName(v), v]));
}

const SKILL_LOOKUP = vocabularyLookup(SKILL_NAMES);
const ABILITY_LOOKUP = vocabularyLookup(ABILITY_NAMES);
const WEAPON_LOOKUP = vocabularyLookup(WEAPON_CATEGORIES);
// „Shield" (Singular) kommt in der Prosa ebenso vor wie „Shields".
const ARMOR_LOOKUP = new Map([...vocabularyLookup(ARMOR_TRAININGS), ['shield', 'Shields' as ArmorTraining]]);

/** Erkennt eine Fertigkeit; null, wenn der Begriff keine ist. */
export const readSkillName = (raw: string): SkillName | null =>
  SKILL_LOOKUP.get(foldRuleName(raw.replace(/\bskills?\b/gi, ''))) ?? null;

/** Erkennt ein Attribut (englischer Name); null, wenn der Begriff keines ist. */
export const readAbilityName = (raw: string): AbilityName | null => ABILITY_LOOKUP.get(foldRuleName(raw)) ?? null;

/** Erkennt eine Waffenkategorie; null bei allem, was eine Einzel-/Sonderregel ist. */
export const readWeaponCategory = (raw: string): WeaponCategory | null =>
  WEAPON_LOOKUP.get(foldRuleName(raw.replace(/\bweapons?\b/gi, ''))) ?? null;

/** Erkennt eine Rüstungsstufe; null bei allem Übrigen (inkl. „None"). */
export const readArmorTraining = (raw: string): ArmorTraining | null =>
  ARMOR_LOOKUP.get(foldRuleName(raw.replace(/\barmou?r\b/gi, '').replace(/\btraining\b/gi, ''))) ?? null;

/**
 * Zerlegt eine SRD-Aufzählung („Light, Medium, and Heavy armor and Shields",
 * „Animal Handling, Athletics, or Survival") in ihre Glieder. Trennt an Kommas
 * sowie an „and"/„or" und wirft Füllwörter weg.
 */
export function splitRuleList(raw: string): string[] {
  return raw
    .split(/,|\band\b|\bor\b/gi)
    .map((s) => s.trim().replace(/^(?:the|a|an)\s+/i, '').replace(/[.;]+$/, '').trim())
    .filter((s) => s && !/^none$/i.test(s));
}

/**
 * Liest eine Fertigkeits-Aufzählung. Wirft bei einem unbekannten Glied — beide
 * Quellen (Open5e v2 und der deutsche SRD-Auszug) sind bekannt deckungsgleich,
 * eine Abweichung ist also ein Parser-Fehler und soll sichtbar werden statt
 * still eine Fertigkeit zu verschlucken.
 */
export function parseSkillNames(raw: string, context = 'Fertigkeitsliste'): SkillName[] {
  const out: SkillName[] = [];
  for (const part of splitRuleList(raw)) {
    const skill = readSkillName(part);
    if (!skill) throw new Error(`${context}: unbekannte Fertigkeit "${part}" (aus "${raw}")`);
    if (!out.includes(skill)) out.push(skill);
  }
  return out;
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };

/**
 * Liest einen Fertigkeits-Grant aus REGEL-PROSA (Spezies-Merkmale, Talente) —
 * anders als die Kerntabelle der Klassen, die eine feste Tabellenform hat.
 * Erkannt werden die drei im SRD 5.2 vorkommenden Formen:
 *
 *   „proficiency in the Insight, Perception, or Survival skill"   → {choose:1, from:[…]}
 *   „proficiency in one skill of your choice"                     → {choose:1, from:[]}
 *   „proficiency in any combination of three skills or tools …"   → {choose:3, from:[]}
 *
 * Bewusst TOLERANT (null statt Wurf): der Aufrufer schickt jede Merkmals-Prosa
 * durch, und alles Nicht-Modellierbare soll einfach Prosa bleiben. Der Wurf-Pfad
 * gehört der Kerntabelle, wo jede Abweichung ein Parser-Fehler ist.
 */
export function parseProseSkillGrant(desc: string): SkillGrant | null {
  const match = desc.match(/proficienc(?:y|ies)\s+in\s+([^.;]+)/i);
  if (!match) return null;
  const phrase = match[1].trim();

  // Freie Wahl mit Anzahl („one skill of your choice", „three skills or tools").
  const counted = phrase.match(/\b(one|two|three|four|five|\d+)\s+(?:more\s+)?skills?\b/i);
  if (counted && /choice|combination/i.test(phrase)) {
    const n = NUMBER_WORDS[counted[1].toLowerCase()] ?? Number(counted[1]);
    return n > 0 ? { fixed: [], choose: n, from: [] } : null;
  }

  // Benannte Fertigkeiten. Ein „or" macht daraus eine Wahl, ein „and" einen festen Grant.
  const names: SkillName[] = [];
  for (const part of splitRuleList(phrase)) {
    const skill = readSkillName(part);
    if (!skill) return null; // Prosa, die diese App nicht als Übung modelliert
    if (!names.includes(skill)) names.push(skill);
  }
  if (!names.length) return null;
  return /\bor\b/i.test(phrase)
    ? { fixed: [], choose: 1, from: names }
    : { fixed: names, choose: 0, from: [] };
}

/**
 * Wandelt ein Zod-Schema in das JSON-Schema um, das Anthropics
 * `output_config.format.json_schema` erwartet.
 *
 * - `io: 'output'` → Felder mit `.default()` gelten als immer vorhanden (required),
 *   genau das gewünschte „strikte, vollständige" LLM-Ergebnis.
 * - `sanitize` erzwingt `additionalProperties: false` auf allen Objekten MIT
 *   `properties` (Records mit Schema-`additionalProperties` bleiben unangetastet)
 *   und entfernt JSON-Schema-Meta (`$schema`), das die API nicht braucht.
 */
export function toLlmJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'output', unrepresentable: 'any' });
  return sanitize(json) as Record<string, unknown>;
}

function sanitize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitize);
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    delete obj['$schema'];
    for (const key of Object.keys(obj)) obj[key] = sanitize(obj[key]);
    collapseNullableAnyOf(obj);
    if (obj.type === 'object' && obj.properties && obj.additionalProperties === undefined) {
      obj.additionalProperties = false;
    }
    return obj;
  }
  return node;
}

/**
 * Zod gibt `.nullable()` ggf. als `{ anyOf: [<schema>, { type: 'null' }] }` aus.
 * Anthropics Structured-Outputs erwartet die kompakte Form `{ type: [<t>, 'null'] }`
 * — bei einfachem Basistyp dorthin zusammenfalten.
 */
function collapseNullableAnyOf(obj: Record<string, unknown>): void {
  const anyOf = obj.anyOf;
  if (!Array.isArray(anyOf) || anyOf.length !== 2) return;
  const nullIdx = anyOf.findIndex((s) => s && typeof s === 'object' && (s as Record<string, unknown>).type === 'null');
  if (nullIdx === -1) return;
  const other = anyOf[1 - nullIdx] as Record<string, unknown> | undefined;
  if (!other || typeof other.type !== 'string') return;
  delete obj.anyOf;
  obj.type = [other.type, 'null'];
  for (const [k, v] of Object.entries(other)) {
    if (k !== 'type' && obj[k] === undefined) obj[k] = v;
  }
}
