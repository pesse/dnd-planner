/**
 * Single Source of Truth für Charaktere: Zod-Schema → TS-Type + Runtime-Validator +
 * LLM-JSON-Schema (siehe shared.ts).
 *
 * Spiegelt das bisherige `CharacterData`-Interface (war in pdf/characterFields.ts).
 * Label-Maps/Helper (SKILL_DEFS, empty*, parseCharacterData, …) bleiben in
 * characterFields.ts, das den Typ von hier re-exportiert.
 */
import { z } from 'zod';
import { migrateSourceKey } from './shared';

// Getrennte Boni für Angriff und Schaden, weil die Effekte genau so wirken: Kampfstil
// „Bogenschießen" nur auf den Wurf, „Duellieren"/Wut nur auf den Schaden. Ein einzelner
// Wert wie `magicBonus` (zählt auf beides) wäre für diese Fälle falsch.
const attackModifierSchema = z.object({
  label: z.string().default(''),
  attackBonus: z.number().int().default(0),
  damageBonus: z.number().int().default(0),
});

const attackSchema = z.object({
  name: z.string().default(''),
  bonus: z.string().default(''),
  damage: z.string().default(''),
  type: z.string().default(''),
  range: z.string().default(''),
  auto: z.boolean().optional().describe('true = bonus/damage werden aus den Feldern berechnet.'),
  ability: z.enum(['str', 'ges', 'finesse']).optional().describe('Welcher Attributsmodifikator zählt.'),
  proficient: z.boolean().optional().describe('Übungsbonus auf den Angriffswurf addieren?'),
  baseDamage: z.string().optional().describe('Schadenswürfel ohne Modifikator, z.B. "1W8".'),
  magicBonus: z.number().int().optional().describe('Magischer Bonus (+X) auf Angriff UND Schaden.'),
  modifiers: z.array(attackModifierSchema).optional()
    .describe('Benannte nicht-magische Zusatzeffekte im Auto-Modus (Kampfstil, Segen …), je mit eigenem Angriffs- und Schadensbonus. Magie gehört in magicBonus.'),
});

// Zauber-Verweis: wie inventory[] ein Bibliotheks-Link auf spell.key mit Namens-Fallback.
// `sourceKey` fehlt bei frei getippten/Alt-Zaubern — dann löst matchSpell über den Namen auf.
const spellRefSchema = z.object({
  name: z.string(),
  sourceKey: z.string().optional(),
});

const spellEntrySchema = spellRefSchema.extend({
  prepared: z.boolean().default(false),
});

const characterSpellsSchema = z
  .object({
    spellcastingClass: z.string().default(''),
    spellcastingAbility: z.string().default(''),
    saveDC: z.number().int().default(0),
    attackBonus: z.number().int().default(0),
    autoCalc: z.boolean().default(true).describe('true = saveDC/attackBonus aus Übungsbonus + Zauberattribut-Mod.'),
    slots: z
      .array(z.object({ total: z.number().int(), used: z.number().int() }))
      .default(() => Array.from({ length: 9 }, () => ({ total: 0, used: 0 })))
      .describe('Index 0 = Stufe 1 … Index 8 = Stufe 9.'),
    cantrips: z.array(spellRefSchema).default([]),
    byLevel: z.record(z.string(), z.array(spellEntrySchema)).default({}),
  })
  .default(() => ({
    spellcastingClass: '', spellcastingAbility: '', saveDC: 0, attackBonus: 0, autoCalc: true,
    slots: Array.from({ length: 9 }, () => ({ total: 0, used: 0 })),
    cantrips: [], byLevel: {},
  }));

export const proficiencyFlagsSchema = z.object({
  simpleWeapons: z.boolean().default(false),
  martialWeapons: z.boolean().default(false),
  otherWeapons: z.string().default('').describe('Freitext: weitere geübte Waffen.'),
  lightArmor: z.boolean().default(false),
  mediumArmor: z.boolean().default(false),
  heavyArmor: z.boolean().default(false),
  shields: z.boolean().default(false),
});

/**
 * Ein Eintrag des Merkmals-Ledgers. Zwei Arten, unterschieden ALLEIN am `sourceKey` —
 * kein Typ-Flag, weil die Auflöser ihre Keys ohnehin liefern:
 *   - Key trifft ein über `classes[]`/`species`/`backgroundRef` abgeleitetes Merkmal
 *     → der Eintrag ANNOTIERT es mit der getroffenen Entscheidung (`choice`).
 *   - Key trifft dort nichts → der Eintrag IST der Grund für das Merkmal (Talent-Link).
 *
 * `name`/`desc` überleben nur, weil Altbestand Einträge ohne `sourceKey` enthält
 * (unverlinktes Talent aus einem Import); sie werden nicht mehr gepflegt.
 */
const characterFeatureSchema = z.object({
  sourceKey: z.string().default(''), // Bibliotheks-Key, z.B. "srd-2024_healer" oder "srd-2024_druid_primal-order"
  name: z.string().default(''),
  /**
   * Getroffene Entscheidung als ENGLISCHES kanonisches Label — die Merkmals-Deutung
   * reasont englisch, und in dieser Sprache kommt die Wahl als `<past_choices>` wieder
   * herein. Die WIRKUNG der Wahl steht weiterhin dort, wo sie hingehört (Übungs-Flags,
   * Zauber, Attribute); dieses Feld ist Provenienz, keine zweite Wahrheit.
   *
   * Altbestand trägt hier Deutsch — bewusst so gelassen: nichts Besseres existiert, und
   * dieses Feld ist zugleich der Diskriminator „Wahl-Eintrag vs. Talent-Link".
   */
  choice: z.string().default(''),
  /**
   * Dasselbe Label auf Deutsch, wörtlich wie der Merkmalstext (`descDe`) es setzt — das
   * ist die Anzeige-Fassung (Editor, Bogen, Merkmals-Text). Bei Altbestand leer, dann
   * trägt `choice` noch das deutsche Label (siehe Upgrade-Schritt 5).
   */
  choiceDe: z.string().default(''),
  gainedAt: z.number().int().optional(), // Stufe — trennt Mehrfachvergaben desselben Keys (Expertise: 1 und 6)
  desc: z.string().default(''),
});

/** Eine gepflegte Klasse eines Charakters (multiclass-fähig; Basis für Progression-Check). */
const characterClassSchema = z.object({
  sourceKey: z.string().default(''), // Bibliotheks-Key der GRUNDklasse; leer = noch nicht verlinkt (Legacy)
  name: z.string().default(''), // Anzeigename der Grundklasse (DE)
  subclassKey: z.string().optional(), // Bibliotheks-Key der Subklasse (innerhalb der Grundklasse)
  subclassName: z.string().optional(), // Anzeigename der Subklasse (DE) — für abgeleiteten Anzeige-String
  level: z.number().int().min(1).max(20).default(1),
});

/**
 * Verknüpfte Spezies eines Charakters (Link auf `vault/species`). Analog zu
 * `classes[]`: der Charakter speichert nur den Link; die Traits werden zur Laufzeit
 * aus der Bibliothek aufgelöst. Leerer `sourceKey` = noch nicht verlinkt (Legacy).
 */
const characterSpeciesSchema = z
  .object({
    sourceKey: z.string().default(''), // Bibliotheks-Key der Spezies
    name: z.string().default(''), // Anzeigename (DE)
    subspeciesKey: z.string().optional(), // Bibliotheks-Key der Unterspezies (falls vorhanden)
    subspeciesName: z.string().optional(),
  })
  .default({ sourceKey: '', name: '' });

/**
 * Verknüpfter Hintergrund eines Charakters (Link auf `vault/backgrounds`). Analog zu
 * `species`: der Charakter speichert nur den Link, die Vorteile werden zur Laufzeit
 * aus der Bibliothek aufgelöst. Leerer `sourceKey` = noch nicht verlinkt (Legacy).
 */
const characterBackgroundSchema = z
  .object({
    sourceKey: z.string().default(''), // Bibliotheks-Key des Hintergrunds
    name: z.string().default(''), // Anzeigename (DE)
  })
  .default({ sourceKey: '', name: '' });

const personalDataSchema = z.object({
  rassenmerkmale: z.string().default(''),
  alter: z.string().default(''),
  geschlecht: z.string().default(''),
  sizeCat: z.string().default(''),
  gesinnung: z.string().default(''),
  glaube: z.string().default(''),
  lebensstil: z.string().default(''),
  taeglicheKosten: z.string().default(''),
  augenfarbe: z.string().default(''),
  haarfarbe: z.string().default(''),
  hautfarbe: z.string().default(''),
  gewicht: z.string().default(''),
  koerpergroesse: z.string().default(''),
  aussehen: z.string().default(''),
});

const skillEntrySchema = z.object({
  value: z.number().int().default(0),
  prof: z.boolean().default(false),
  exp: z.boolean().default(false),
});

export const characterSchema = z.object({
  // Kopf
  name: z.string(),
  // Strukturierte Klassen/Level-Items (Source-of-Truth, multiclass-fähig).
  classes: z.array(characterClassSchema).default([]),
  // Abgeleiteter Anzeige-String aus `classes` (für Header/PDF); nicht mehr direkt editiert.
  classLevel: z.string().default(''),
  playerName: z.string().default(''),
  // Strukturierter Hintergrund-Link (Source-of-Truth). `background` wird daraus abgeleitet.
  backgroundRef: characterBackgroundSchema,
  // Abgeleiteter Anzeige-String aus `backgroundRef` (für Header/PDF); nicht mehr direkt editiert.
  background: z.string().default(''),
  // Strukturierter Spezies-Link (Source-of-Truth). `race` wird daraus abgeleitet.
  species: characterSpeciesSchema,
  // Abgeleiteter Anzeige-String aus `species` (für Header/PDF); nicht mehr direkt editiert.
  race: z.string().default(''),
  xp: z.string().default(''),
  // Attribute (Basiswerte)
  str: z.number().int().default(10), ges: z.number().int().default(10), kon: z.number().int().default(10),
  int: z.number().int().default(10), wei: z.number().int().default(10), cha: z.number().int().default(10),
  // Modifikatoren (berechnet)
  strMod: z.number().int().default(0), gesMod: z.number().int().default(0), konMod: z.number().int().default(0),
  intMod: z.number().int().default(0), weiMod: z.number().int().default(0), chaMod: z.number().int().default(0),
  // Kampf
  ac: z.string().default(''),
  initiative: z.string().default(''),
  speed: z.string().default(''),
  hpMax: z.string().default(''),
  hpCurrent: z.string().default(''),
  hpTemp: z.string().default(''),
  proficiencyBonus: z.number().int().default(2),
  passivePerception: z.string().default(''),
  hitDice: z.string().default(''),
  // Rettungswürfe (Übungen)
  strSaveProf: z.boolean().default(false), gesSaveProf: z.boolean().default(false), konSaveProf: z.boolean().default(false),
  intSaveProf: z.boolean().default(false), weiSaveProf: z.boolean().default(false), chaSaveProf: z.boolean().default(false),
  // Fertigkeiten (Übungen + Expertise)
  skills: z.record(z.string(), skillEntrySchema).default({}),
  // Angriffe
  attacks: z.array(attackSchema).default([]),
  // Klassenmerkmale
  classFeatures: z.string().default(''),
  // Persönlichkeit
  traits: z.string().default(''), ideals: z.string().default(''), bonds: z.string().default(''), flaws: z.string().default(''),
  // Sprachen & Werkzeuge
  languages: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  alleskoenner: z.boolean().default(false),
  // Währung
  currency: z
    .object({ km: z.string(), sm: z.string(), em: z.string(), gm: z.string(), pm: z.string() })
    .default({ km: '', sm: '', em: '', gm: '', pm: '' }),
  // Inventar
  inventory: z
    .array(
      z.object({
        name: z.string(),
        /**
         * Bibliotheks-Link auf `item.key`. Fehlt er, löst `matchItem` über den Namen auf —
         * darum kommt das Feld ohne Migrationsschritt aus; nachverlinkt wird im Editor.
         */
        sourceKey: z.string().optional(),
        count: z.string().default(''),
        weight: z.string().default(''),
      }),
    )
    .default([]),
  inventoryNotes: z.string().default(''),
  totalWeight: z.string().default(''),
  // Zauber
  spells: characterSpellsSchema,
  // Persönliches (immer vorhanden → Bindings/Anzeige sicher)
  personal: personalDataSchema.default({
    rassenmerkmale: '', alter: '', geschlecht: '', sizeCat: '', gesinnung: '', glaube: '',
    lebensstil: '', taeglicheKosten: '', augenfarbe: '', haarfarbe: '', hautfarbe: '',
    gewicht: '', koerpergroesse: '', aussehen: '',
  }),
  // Waffenübungen & Rüstungsausbildung (immer vorhanden)
  proficiencies: proficiencyFlagsSchema.default({
    simpleWeapons: false, martialWeapons: false, otherWeapons: '',
    lightArmor: false, mediumArmor: false, heavyArmor: false, shields: false,
  }),
  /**
   * Waffennamen, aufgelöst über `matchItem` — bewusst OHNE `sourceKey`, anders als das
   * Inventar: die Liste nennt Waffenarten statt Besitz und wird pro Rast getauscht.
   *
   * Die Eigenschaft selbst steht am Item (`item.mastery`), nicht hier: sie hängt an
   * der Waffenart, nicht am Charakter. Ein Tausch (nach jeder langen Rast erlaubt)
   * ist deshalb eine reine Änderung dieser Liste.
   */
  masteries: z
    .array(z.string())
    .default([])
    .describe('Namen der Waffen, deren Meisterschaftseigenschaft der Charakter nutzen darf.'),
  /**
   * Merkmals-Ledger: Talent-Links UND getroffene Merkmals-Entscheidungen in einer Liste
   * (additiv zum Freitext; NICHT im PDF, Berechnungsgrundlage). Siehe
   * `characterFeatureSchema` für die beiden Eintragsarten.
   */
  features: z.array(characterFeatureSchema).default([]),
  // Portrait (Datei im Charakter-Ordner)
  portraitFile: z.string().optional(),
  // ── Metadaten (nicht editierbar; werden im Draft mitgeführt) ──
  // Schemaversion der Datei — bewusst offen (int), damit eine künftige Version
  // eine ältere App nicht am Laden hindert. Siehe CHARACTER_VERSION unten.
  _version: z.number().int().min(1).optional(),
  _importedFrom: z.string().optional(),
  _importedAt: z.string().optional(),
});

export type Character = z.infer<typeof characterSchema>;
export type CharacterSpells = z.infer<typeof characterSpellsSchema>;
export type Attack = z.infer<typeof attackSchema>;
export type AttackModifier = z.infer<typeof attackModifierSchema>;
export type SpellEntry = z.infer<typeof spellEntrySchema>;
export type SpellRef = z.infer<typeof spellRefSchema>;
export type ProficiencyFlags = z.infer<typeof proficiencyFlagsSchema>;
export type PersonalData = z.infer<typeof personalDataSchema>;
export type CharacterFeatureEntry = z.infer<typeof characterFeatureSchema>;
export type CharacterClass = z.infer<typeof characterClassSchema>;
export type CharacterSpecies = z.infer<typeof characterSpeciesSchema>;
export type CharacterBackground = z.infer<typeof characterBackgroundSchema>;

/** Anzeige-String der Spezies (inkl. optionaler Unterspezies). */
export function formatSpecies(species: CharacterSpecies | undefined): string {
  if (!species) return '';
  const base = species.name.trim();
  const sub = species.subspeciesName?.trim();
  if (!base) return '';
  return sub ? `${base} (${sub})` : base;
}

/** Anzeige-String aus den strukturierten Klassen, z.B. „Kämpfer 5 (Champion) / Zauberer 2". */
export function formatClassLevel(classes: CharacterClass[]): string {
  return (classes ?? [])
    .filter((c) => c.name.trim())
    .map((c) => `${c.name.trim()} ${c.level}${c.subclassName?.trim() ? ` (${c.subclassName.trim()})` : ''}`)
    .join(' / ');
}

/** Gesamtstufe (Summe der Einzelstufen) über alle gepflegten Klassen. */
export function totalLevel(classes: CharacterClass[]): number {
  return (classes ?? []).reduce((sum, c) => sum + (c.level || 0), 0);
}

/** Stufen-Schlüsselwörter, die zwischen Klassenname und Zahl stehen können. */
const LEVEL_KEYWORD_RE = /\b(?:level|lvl|lv|stufe|stufen|grad)\b/gi;

/**
 * Entfernt Stufen-Schlüsselwörter und Rand-Interpunktion aus einem Klassennamen
 * („Schurke Level" → „Schurke"). Kollabiert Mehrfach-Leerraum.
 */
export function cleanClassName(name: string): string {
  return (name ?? '')
    .replace(LEVEL_KEYWORD_RE, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,:_-]+|[\s.,:_-]+$/g, '')
    .trim();
}

/**
 * Zerlegt einen Freitext-Eintrag wie „Waldläufer 5" oder „Schurke Level 2" in
 * Name + Stufe. Angehängte Ganzzahl = Stufe (Default 1), Rest = Name (bereinigt um
 * Stufen-Schlüsselwörter; sourceKey bleibt leer).
 */
function parseClassLevelPart(part: string): CharacterClass | null {
  const trimmed = part.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^(.*?)[\s.,-]*(\d{1,2})\s*$/);
  const level = m ? Math.min(20, Math.max(1, Number(m[2]))) : 1;
  const name = cleanClassName(m ? m[1] : trimmed);
  if (!name) return null;
  return { sourceKey: '', name, level };
}

/**
 * Zerlegt einen Freitext-Klassenstring wie „Kämpfer 5 / Zauberer 2" in strukturierte
 * Klassen-Einträge. Trennung an „/"; sourceKey/Subklasse bleiben leer (Bibliotheks-
 * Verknüpfung erfolgt separat). Für Migration UND explizite Umstellung in der UI.
 */
export function parseClassLevelText(text: string): CharacterClass[] {
  return (text ?? '')
    .split('/')
    .map(parseClassLevelPart)
    .filter((x): x is CharacterClass => x !== null);
}

// ── Charakter-Upgrade (versioniert) ──────────────────────────────────────────
//
// Charaktere liegen als Dateien im Vault und überleben jede Programmversion.
// Damit Schema-Änderungen einen definierten Ort haben, ist die Migration eine
// GEORDNETE PIPELINE statt einer Sammlung von Ad-hoc-Reparaturen: jeder Schritt
// trägt seine Zielversion, eine deutsche Beschreibung fürs Protokoll und eine
// idempotente `apply`-Funktion. Beim Laden laufen alle Schritte, deren
// Zielversion über der gespeicherten liegt; danach wird `_version` gestempelt.
//
// Zwei Regeln für neue Schritte:
//   1. `CHARACTER_VERSION` erhöhen und GENAU EINEN Schritt mit dieser `to` ergänzen.
//   2. `apply` muss idempotent und inhaltlich abgesichert sein — Altbestand trägt
//      oft keine oder eine zu niedrige `_version`, obwohl die Umstellung schon
//      passiert ist (früher lief die Migration ohne Versionsstempel).
//
// In die DATEI geschrieben wird das Upgrade nicht automatisch, sondern als sichtbare
// Aktion pro Charakter: der Bearbeiten-Modus zeigt einen Hinweis, sobald
// `pendingCharacterUpgrade` etwas meldet.

/** Aktuelle Charakter-Schemaversion. Bei jeder Formatänderung erhöhen. */
export const CHARACTER_VERSION = 6;

export interface CharacterUpgrade {
  /** Version, die dieser Schritt herstellt. */
  to: number;
  /** Deutsche Kurzbeschreibung — erscheint im Upgrade-Protokoll. */
  label: string;
  apply: (c: Record<string, unknown>) => void;
}

export const CHARACTER_UPGRADES: CharacterUpgrade[] = [
  {
    to: 2,
    label: 'Freitext-Klasse → strukturierte Klassen-Einträge',
    apply: (c) => {
      // Best-effort: „Kämpfer 5 / Zauberer 2" → classes[]. Nur wenn noch keine
      // gepflegt sind, damit bereits umgestellte Charaktere unberührt bleiben.
      const hasClasses = Array.isArray(c.classes) && c.classes.length > 0;
      if (hasClasses || typeof c.classLevel !== 'string' || !c.classLevel.trim()) return;
      const parsed = parseClassLevelText(c.classLevel);
      if (parsed.length) c.classes = parsed;
    },
  },
  {
    to: 3,
    label: 'Volk/Hintergrund → Bibliotheks-Links, Key-Präfixe aktualisiert',
    apply: (c) => {
      // Legacy-Freitexte → strukturierte Links. `sourceKey` bleibt leer, bis der
      // Bibliotheks-Picker im Editor greift; der Name ist der bisherige Freitext.
      const sp = c.species as { sourceKey?: string; name?: string } | undefined;
      const hasSpecies = sp && typeof sp === 'object' && ((sp.sourceKey ?? '').trim() || (sp.name ?? '').trim());
      if (!hasSpecies && typeof c.race === 'string' && c.race.trim())
        c.species = { sourceKey: '', name: c.race.trim() };

      const bg = c.backgroundRef as { sourceKey?: string; name?: string } | undefined;
      const hasBackground = bg && typeof bg === 'object' && ((bg.sourceKey ?? '').trim() || (bg.name ?? '').trim());
      if (!hasBackground && typeof c.background === 'string' && c.background.trim())
        c.backgroundRef = { sourceKey: '', name: c.background.trim() };

      // Bibliotheks-Links auf das aktuelle Key-Präfix ziehen ("homebrew_" → "homebrew-sam_").
      for (const cls of (Array.isArray(c.classes) ? c.classes : []) as Record<string, unknown>[]) {
        if (cls?.sourceKey) cls.sourceKey = migrateSourceKey(cls.sourceKey as string);
        if (cls?.subclassKey) cls.subclassKey = migrateSourceKey(cls.subclassKey as string);
      }
      const species = c.species as Record<string, unknown> | undefined;
      if (species?.sourceKey) species.sourceKey = migrateSourceKey(species.sourceKey as string);
      if (species?.subspeciesKey) species.subspeciesKey = migrateSourceKey(species.subspeciesKey as string);
      const background = c.backgroundRef as Record<string, unknown> | undefined;
      if (background?.sourceKey) background.sourceKey = migrateSourceKey(background.sourceKey as string);
      // Schritt 4 zieht references.feats nach features um; hier liegt es noch am alten Ort.
      const refs = c.references as { feats?: Record<string, unknown>[] } | undefined;
      for (const f of refs?.feats ?? []) {
        if (f?.sourceKey) f.sourceKey = migrateSourceKey(f.sourceKey as string);
      }
    },
  },
  {
    to: 4,
    label: 'Talent-Referenzen → Merkmals-Ledger (references.feats → features)',
    apply: (c) => {
      const refs = c.references as { feats?: Record<string, unknown>[] } | undefined;
      const legacy = (refs?.feats ?? []).map((f) => ({
        sourceKey: migrateSourceKey((f?.sourceKey as string) ?? ''),
        name: (f?.name as string) ?? '',
        choice: '',
        ...(typeof f?.gainedAt === 'number' ? { gainedAt: f.gainedAt } : {}),
        desc: (f?.desc as string) ?? '',
      }));
      // Inhaltlich abgesichert und verlustfrei: was schon in `features` steht (Umstellung
      // bereits gelaufen, `_version` aber zu niedrig), bleibt und wird nicht dupliziert.
      const existing = (Array.isArray(c.features) ? c.features : []) as { sourceKey?: string; name?: string }[];
      const known = new Set(existing.map((e) => `${e.sourceKey ?? ''}|${e.name ?? ''}`));
      c.features = [...existing, ...legacy.filter((e) => !known.has(`${e.sourceKey}|${e.name}`))];
      delete c.references;
    },
  },
  {
    to: 5,
    label: 'Zauber: Zaubertricks als Objektliste (Vorbereitung Key-Verknüpfung)',
    apply: (c) => {
      const sp = c.spells as Record<string, unknown> | undefined;
      if (!sp || typeof sp !== 'object' || !Array.isArray(sp.cantrips)) return;
      // Idempotent + inhaltlich abgesichert: nur noch-Strings wandeln; bereits migrierte
      // {name,…}-Objekte bleiben unangetastet (Legacy-Dateien ohne/mit zu niedrigem _version).
      // Keys werden NICHT erfunden — sourceKey bleibt leer und löst zur Laufzeit über den Namen auf.
      sp.cantrips = (sp.cantrips as unknown[]).map((x) => (typeof x === 'string' ? { name: x } : x));
    },
  },
  {
    to: 6,
    label: 'Merkmals-Wahl: deutsches Label nach choiceDe',
    apply: (c) => {
      // `choice` führt ab jetzt das englische Label; das bisherige deutsche wandert in die
      // Anzeige-Fassung. `choice` bleibt dabei STEHEN: es ist an sechs Stellen der
      // Diskriminator „Wahl-Eintrag vs. Talent-Link", und leeren würde diese Aufteilung
      // still umwerfen. Inhaltlich abgesichert über das leere `choiceDe`.
      const features = Array.isArray(c.features) ? (c.features as Record<string, unknown>[]) : [];
      for (const f of features) {
        if (!f || typeof f !== 'object') continue;
        const choice = typeof f.choice === 'string' ? f.choice : '';
        const choiceDe = typeof f.choiceDe === 'string' ? f.choiceDe : '';
        if (choice.trim() && !choiceDe.trim()) f.choiceDe = choice;
      }
    },
  },
];

/**
 * Gespeicherte Version eines rohen Charakters. Ohne `_version` gilt 1 — so waren
 * die Dateien, bevor es das Feld gab.
 */
export function characterVersionOf(raw: unknown): number {
  const v = (raw as { _version?: unknown } | null)?._version;
  return typeof v === 'number' && v >= 1 ? Math.floor(v) : 1;
}

export interface CharacterUpgradeResult {
  data: Record<string, unknown>;
  fromVersion: number;
  toVersion: number;
  /** Beschreibungen der angewandten Schritte, in Reihenfolge. */
  applied: string[];
}

/**
 * Zieht einen rohen Charakter auf `CHARACTER_VERSION` und protokolliert, was
 * angewandt wurde. Wirft nie; ein Schritt, der an kaputten Daten scheitert, wird
 * übersprungen, damit ein einzelnes Feld nicht die ganze Datei unlesbar macht.
 */
export function upgradeCharacter(raw: unknown): CharacterUpgradeResult {
  const empty = { data: {}, fromVersion: CHARACTER_VERSION, toVersion: CHARACTER_VERSION, applied: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;

  const data = { ...(raw as Record<string, unknown>) };
  const fromVersion = characterVersionOf(data);
  const applied: string[] = [];

  for (const step of CHARACTER_UPGRADES) {
    if (step.to <= fromVersion) continue;
    try {
      step.apply(data);
      applied.push(step.label);
    } catch {
      /* Einzelschritt übersprungen — der Rest der Datei bleibt nutzbar. */
    }
  }
  data._version = CHARACTER_VERSION;
  return { data, fromVersion, toVersion: CHARACTER_VERSION, applied };
}

export interface PendingCharacterUpgrade {
  fromVersion: number;
  toVersion: number;
  /** Beschreibungen der Schritte, die greifen würden. Leer = nur der Versionsstempel fehlt. */
  applied: string[];
}

/**
 * Würde ein Upgrade dieser DATEI etwas ändern? `null` = nein, sie ist aktuell.
 *
 * Der Vergleich läuft über einen Schnappschuss VOR dem Upgrade: `upgradeCharacter`
 * kopiert nur flach, seine Schritte mutieren verschachtelte Objekte von `raw` mit —
 * hinterher serialisiert, sähen reine Feld-Umschreibungen (Schritt 3 auf
 * `species.sourceKey`) identisch aus und die Datei bliebe still veraltet.
 */
export function pendingCharacterUpgrade(raw: unknown): PendingCharacterUpgrade | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const before = JSON.stringify(raw);
  const fromVersion = characterVersionOf(raw);
  const result = upgradeCharacter(raw);
  if (before === JSON.stringify(result.data)) return null;
  return { fromVersion, toVersion: result.toVersion, applied: result.applied };
}

/**
 * Migriert Altformat-Felder, bevor das Schema greift (Eintritt für
 * `normalizeCharacter`/`parseCharacter`). Idempotent — dünne Hülle um
 * `upgradeCharacter`.
 */
export function migrateCharacterLegacy(raw: unknown): Record<string, unknown> {
  return upgradeCharacter(raw).data;
}
