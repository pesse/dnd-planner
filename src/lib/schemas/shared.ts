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
// Genau drei Werte, siehe vault/CLAUDE.md. Sie steuern, in welchen verteilbaren
// Pack eine Datei fällt (vault/libraries.yaml, fail-closed), sind der
// `document.key` der Open5e-Artefakte und zugleich das Präfix jedes Main-Keys
// ("srd-2024_alert", "homebrew-sam_runenhammer"). Ein anderer Wert lässt den
// Pack-Build abbrechen.

export const SOURCE_KEYS = ['srd-2024', 'phb-2024', 'homebrew-sam'] as const;
export type SourceKey = (typeof SOURCE_KEYS)[number];

/** Default für alles, was in der App neu entsteht. */
export const OWN_SOURCE: SourceKey = 'homebrew-sam';

export const SOURCE_LABELS: Record<SourceKey, string> = {
  'srd-2024': 'SRD 5.2',
  'phb-2024': 'PHB 2024',
  'homebrew-sam': 'Eigen',
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
 * Beliebige Herkunftsangabe → einer der drei gültigen Werte.
 *
 * Unbekanntes (leer, Fremdimport, Open5e-Dokumente außerhalb SRD 5.2 wie
 * `srd-2014`) fällt auf `homebrew-sam`. Das ist die sichere Richtung: der Pack
 * ist codiert, das Material landet also nie ungeprüft in einer offenen Library.
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
