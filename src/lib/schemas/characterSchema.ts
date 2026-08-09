/**
 * Single Source of Truth für Charaktere: Zod-Schema → TS-Type + Runtime-Validator +
 * LLM-JSON-Schema.
 */
import { z } from 'zod';
import { abilityFlagsSchema, abilityModsSchema, abilityScoresSchema } from './abilities';
import { characterSpellcastingSchema, emptyCharacterSpellcasting } from './spellcasting';
import { CHARACTER_VERSION } from './characterUpgrades';

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
  sourceKey: z.string().optional()
    .describe('Bibliotheks-Link auf item.key wie bei inventory[]; fehlt er, identifiziert der Name.'),
  bonus: z.string().default(''),
  damage: z.string().default(''),
  type: z.string().default(''),
  range: z.string().default(''),
  auto: z.boolean().optional().describe('true = bonus/damage werden aus den Feldern berechnet.'),
  ability: z.enum(['str', 'dex', 'finesse']).optional().describe('Welcher Attributsmodifikator zählt.'),
  proficient: z.boolean().optional().describe('Übungsbonus auf den Angriffswurf addieren?'),
  baseDamage: z.string().optional().describe('Schadenswürfel ohne Modifikator, z.B. "1W8".'),
  magicBonus: z.number().int().optional().describe('Magischer Bonus (+X) auf Angriff UND Schaden.'),
  modifiers: z.array(attackModifierSchema).optional()
    .describe('Benannte nicht-magische Zusatzeffekte im Auto-Modus (Kampfstil, Segen …), je mit eigenem Angriffs- und Schadensbonus. Magie gehört in magicBonus.'),
});

// Altform des Zauber-Blocks: der NAME identifiziert. Sie steht noch in Dateien, die nie neu
// gespeichert wurden; Wahrheit ist `spellcasting`.
const spellRefSchema = z.object({
  name: z.string(),
  sourceKey: z.string().optional(),
});

const spellEntrySchema = spellRefSchema.extend({
  prepared: z.boolean().default(false),
});

export const characterSpellsSchema = z.object({
  spellcastingClass: z.string().default(''),
  spellcastingAbility: z.string().default(''),
  saveDC: z.number().int().default(0),
  attackBonus: z.number().int().default(0),
  autoCalc: z.boolean().default(true),
  slots: z
    .array(z.object({ total: z.number().int(), used: z.number().int() }))
    .default(() => Array.from({ length: 9 }, () => ({ total: 0, used: 0 })))
    .describe('Index 0 = Stufe 1 … Index 8 = Stufe 9.'),
  cantrips: z.array(spellRefSchema).default([]),
  byLevel: z.record(z.string(), z.array(spellEntrySchema)).default({}),
});

export const emptyFlatSpells = (): CharacterSpells => ({
  spellcastingClass: '', spellcastingAbility: '', saveDC: 0, attackBonus: 0, autoCalc: true,
  slots: Array.from({ length: 9 }, () => ({ total: 0, used: 0 })),
  cantrips: [], byLevel: {},
});

export const proficiencyFlagsSchema = z.object({
  simpleWeapons: z.boolean().default(false),
  martialWeapons: z.boolean().default(false),
  /**
   * Einzeln erklärte Waffen — Anzeigenamen wie bei `masteries`, aufgelöst über `matchItem`.
   * Die zwei Kategorie-Häkchen können „nur einfache Waffen, dazu das Kurzschwert" nicht
   * ausdrücken; diese Liste WIRKT (Auswahl der Waffenbeherrschung, Übungsbonus am Angriff),
   * anders als der Freitext daneben.
   */
  individualWeapons: z
    .array(z.string())
    .default([])
    .describe('Namen einzelner Waffen, mit denen der Charakter geübt ist.'),
  otherWeapons: z
    .string()
    .default('')
    .describe('Freitext: Waffenübungen ohne Bibliotheks-Entsprechung, ohne mechanische Wirkung.'),
  lightArmor: z.boolean().default(false),
  mediumArmor: z.boolean().default(false),
  heavyArmor: z.boolean().default(false),
  shields: z.boolean().default(false),
});

export const emptyProficiencies = (): ProficiencyFlags => ({
  simpleWeapons: false, martialWeapons: false, individualWeapons: [], otherWeapons: '',
  lightArmor: false, mediumArmor: false, heavyArmor: false, shields: false,
});

/**
 * Ein Eintrag des Merkmals-Ledgers. Zwei Arten, unterschieden ALLEIN am `sourceKey`:
 * trifft er ein aus `classes[]`/`species`/`backgroundRef` abgeleitetes Merkmal, ANNOTIERT
 * der Eintrag es mit der Wahl; trifft er nichts, IST er der Grund (Talent-Link).
 * `name`/`desc` überleben nur für Altbestand ohne `sourceKey` und werden nicht gepflegt.
 */
const characterFeatureSchema = z.object({
  sourceKey: z.string().default(''), // z.B. "srd-2024_healer" oder "srd-2024_druid_primal-order"
  name: z.string().default(''),
  /**
   * Die Wahl als ENGLISCHES kanonisches Label, weil sie in dieser Sprache als
   * `<past_choices>` wieder hereinkommt; die WIRKUNG steht anderswo (Übungen, Zauber,
   * Attribute), das hier ist Provenienz. Altbestand trägt Deutsch — bewusst gelassen,
   * das Feld ist zugleich der Diskriminator „Wahl-Eintrag vs. Talent-Link".
   */
  choice: z.string().default(''),
  /**
   * Anzeige-Fassung, wörtlich aus `descDe` zitiert. Bei Altbestand leer, dann trägt
   * `choice` noch das deutsche Label (siehe Upgrade-Schritt 5).
   */
  choiceDe: z.string().default(''),
  /**
   * WELCHE Frage beantwortet wurde — die id der Wahl, identisch auf beiden Seiten
   * (`choiceIdOf` beim Lesen, `LevelUpQuestion.id` beim Schreiben). `sourceKey` + `gainedAt`
   * trennen sie nicht: ein Merkmal stellt mehrere Fragen auf derselben Vergabe-Stufe.
   * Leer = Altbestand, dann ordnet die Nachsicht in `buildCharacterChoices` zu.
   */
  choiceId: z.string().default(''),
  gainedAt: z.number().int().optional(), // trennt Mehrfachvergaben desselben Keys (Expertise: 1 und 6)
  desc: z.string().default(''),
});

/**
 * Eine Wahl aus einem Options-Pool. `value` ist das kanonische ENGLISCHE Label der Deklaration
 * (`choiceOptionSchema.value`) und damit der Anker, `valueDe` das Zitat fürs Anzeigen —
 * dieselbe Aufteilung wie `choice`/`choiceDe` im Ledger.
 */
const optionPickSchema = z.object({
  sourceKey: z.string().default('').describe('Key des Merkmals, dessen Pool die Option stellt.'),
  value: z.string().default(''),
  valueDe: z.string().default(''),
});

const characterClassSchema = z.object({
  sourceKey: z.string().default(''), // GRUNDklasse; leer = noch nicht verlinkt (Legacy)
  name: z.string().default(''),
  subclassKey: z.string().optional(),
  subclassName: z.string().optional(),
  level: z.number().int().min(1).max(20).default(1),
});

/**
 * Wie `classes[]` nur der Link; die Traits werden zur Laufzeit aus der Bibliothek
 * aufgelöst. Leerer `sourceKey` = noch nicht verlinkt (Legacy).
 */
const characterSpeciesSchema = z
  .object({
    sourceKey: z.string().default(''),
    name: z.string().default(''),
    subspeciesKey: z.string().optional(),
    subspeciesName: z.string().optional(),
  })
  .default({ sourceKey: '', name: '' });

const characterBackgroundSchema = z
  .object({
    sourceKey: z.string().default(''),
    name: z.string().default(''),
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

export const emptyPersonal = (): PersonalData => ({
  rassenmerkmale: '', alter: '', geschlecht: '', sizeCat: '',
  gesinnung: '', glaube: '', lebensstil: '', taeglicheKosten: '',
  augenfarbe: '', haarfarbe: '', hautfarbe: '', gewicht: '',
  koerpergroesse: '', aussehen: '',
});

const skillEntrySchema = z.object({
  value: z.number().int().default(0),
  prof: z.boolean().default(false),
  exp: z.boolean().default(false),
});

export const characterSchema = z.object({
  // Identität des Charakters und zugleich sein Ordnername unter `vault/characters/`.
  // Nachgeschlagen wird über den Ordner; das Feld macht die Datei selbstbeschreibend.
  uid: z.string().default(''),
  // `classes`/`backgroundRef`/`species` sind die Source of Truth; `classLevel`/`background`/
  // `race` daraus abgeleitete Anzeige-Strings für Header und Bogen, nicht direkt editiert.
  name: z.string(),
  classes: z.array(characterClassSchema).default([]),
  classLevel: z.string().default(''),
  playerName: z.string().default(''),
  backgroundRef: characterBackgroundSchema,
  background: z.string().default(''),
  species: characterSpeciesSchema,
  race: z.string().default(''),
  xp: z.string().default(''),
  abilities: abilityScoresSchema,
  // aus den Basiswerten berechnet
  mods: abilityModsSchema,
  ac: z.string().default(''),
  initiative: z.string().default(''),
  speed: z.string().default(''),
  hpMax: z.string().default(''),
  hpCurrent: z.string().default(''),
  hpTemp: z.string().default(''),
  proficiencyBonus: z.number().int().default(2),
  passivePerception: z.string().default(''),
  hitDice: z.string().default(''),
  saveProfs: abilityFlagsSchema,
  skills: z.record(z.string(), skillEntrySchema).default({}),
  attacks: z.array(attackSchema).default([]),
  classFeatures: z.string().default(''),
  traits: z.string().default(''), ideals: z.string().default(''), bonds: z.string().default(''), flaws: z.string().default(''),
  languages: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  alleskoenner: z.boolean().default(false),
  currency: z
    .object({ km: z.string(), sm: z.string(), em: z.string(), gm: z.string(), pm: z.string() })
    .default({ km: '', sm: '', em: '', gm: '', pm: '' }),
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
  spellcasting: characterSpellcastingSchema.default(emptyCharacterSpellcasting),
  /**
   * ALTFELD: nur noch Eingang. `services/spellcasting/legacy.ts` baut daraus beim Laden die
   * neue Form, und der nächste Speichervorgang lässt es fallen — nichts liest es sonst.
   */
  spells: characterSpellsSchema.optional(),
  personal: personalDataSchema.default({
    rassenmerkmale: '', alter: '', geschlecht: '', sizeCat: '', gesinnung: '', glaube: '',
    lebensstil: '', taeglicheKosten: '', augenfarbe: '', haarfarbe: '', hautfarbe: '',
    gewicht: '', koerpergroesse: '', aussehen: '',
  }),
  // FUNKTIONS-Default wie bei `characterSpellsSchema`: eine Literal-Liste darin wäre EIN
  // Array für alle geparsten Charaktere, und `individualWeapons` wird in place ergänzt.
  proficiencies: proficiencyFlagsSchema.default(() => ({
    simpleWeapons: false, martialWeapons: false, individualWeapons: [], otherWeapons: '',
    lightArmor: false, mediumArmor: false, heavyArmor: false, shields: false,
  })),
  /**
   * Waffen*namen*, bewusst OHNE `sourceKey`: die Liste nennt Waffenarten statt Besitz. Die
   * Eigenschaft selbst steht am Item (`item.mastery`), also ist der nach jeder langen Rast
   * erlaubte Tausch eine reine Änderung dieser Liste — ohne Rückschreiben.
   */
  masteries: z
    .array(z.string())
    .default([])
    .describe('Namen der Waffen, deren Meisterschaftseigenschaft der Charakter nutzen darf.'),
  /**
   * EINE flache Liste für ALLE Pools, geschlüsselt am Merkmal — die Anrufungen des
   * Hexenmeisters brauchen damit kein zweites Feld. Nicht ins Merkmals-Ledger: das trägt die
   * Anker, nicht die Inhalte (Zauber stehen im Zauberblock, Waffen in `masteries`).
   */
  optionPicks: z
    .array(optionPickSchema)
    .default([])
    .describe('Gewählte Optionen aus deklarierten Options-Pools (Metamagie), je Merkmal.'),
  // Merkmals-Ledger, additiv zum Freitext: Berechnungsgrundlage, keine Anzeigequelle.
  features: z.array(characterFeatureSchema).default([]),
  /**
   * Reine Ausgabe-Auswahl, ohne Regelwirkung — deshalb nicht ins Merkmals-Ledger, das die
   * Anker der Mechanik trägt. Ein Key ohne Merkmal (getauschter Klassen-Link) bleibt stehen.
   */
  pinnedFeatures: z
    .array(z.string())
    .default([])
    .describe('Keys der Merkmale, die im Ausdruck als Volltext angehängt werden.'),
  portraitFile: z.string().optional(), // Dateiname im Charakter-Ordner
  // `_version` bewusst offener int, kein Literal-Union: eine von einer neueren App
  // geschriebene Datei soll in einer älteren trotzdem laden. Default nur für neu
  // ENTSTANDENE Charaktere (Blanko, Wizard) — der Lesepfad stempelt vor dem Parse
  // immer explizit über `upgradeCharacter`, der Default greift dort nie.
  _version: z.number().int().min(1).default(CHARACTER_VERSION),
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
export type OptionPick = z.infer<typeof optionPickSchema>;
export type CharacterClass = z.infer<typeof characterClassSchema>;
export type CharacterSpecies = z.infer<typeof characterSpeciesSchema>;
export type CharacterBackground = z.infer<typeof characterBackgroundSchema>;
