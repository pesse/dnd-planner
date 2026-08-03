/**
 * Single Source of Truth für Charaktere: Zod-Schema → TS-Type + Runtime-Validator +
 * LLM-JSON-Schema. Label-Maps und der PDF-Parser leben in `pdf/characterFields.ts`,
 * das den Typ von hier re-exportiert.
 */
import { z } from 'zod';

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
  gainedAt: z.number().int().optional(), // trennt Mehrfachvergaben desselben Keys (Expertise: 1 und 6)
  desc: z.string().default(''),
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

const skillEntrySchema = z.object({
  value: z.number().int().default(0),
  prof: z.boolean().default(false),
  exp: z.boolean().default(false),
});

export const characterSchema = z.object({
  // `classes`/`backgroundRef`/`species` sind die Source of Truth; `classLevel`/`background`/
  // `race` daraus abgeleitete Anzeige-Strings für Header und PDF, nicht direkt editiert.
  name: z.string(),
  classes: z.array(characterClassSchema).default([]),
  classLevel: z.string().default(''),
  playerName: z.string().default(''),
  backgroundRef: characterBackgroundSchema,
  background: z.string().default(''),
  species: characterSpeciesSchema,
  race: z.string().default(''),
  xp: z.string().default(''),
  str: z.number().int().default(10), ges: z.number().int().default(10), kon: z.number().int().default(10),
  int: z.number().int().default(10), wei: z.number().int().default(10), cha: z.number().int().default(10),
  // aus den Basiswerten berechnet
  strMod: z.number().int().default(0), gesMod: z.number().int().default(0), konMod: z.number().int().default(0),
  intMod: z.number().int().default(0), weiMod: z.number().int().default(0), chaMod: z.number().int().default(0),
  ac: z.string().default(''),
  initiative: z.string().default(''),
  speed: z.string().default(''),
  hpMax: z.string().default(''),
  hpCurrent: z.string().default(''),
  hpTemp: z.string().default(''),
  proficiencyBonus: z.number().int().default(2),
  passivePerception: z.string().default(''),
  hitDice: z.string().default(''),
  strSaveProf: z.boolean().default(false), gesSaveProf: z.boolean().default(false), konSaveProf: z.boolean().default(false),
  intSaveProf: z.boolean().default(false), weiSaveProf: z.boolean().default(false), chaSaveProf: z.boolean().default(false),
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
  spells: characterSpellsSchema,
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
  // Merkmals-Ledger, additiv zum Freitext: NICHT im PDF, aber Berechnungsgrundlage.
  features: z.array(characterFeatureSchema).default([]),
  portraitFile: z.string().optional(), // Dateiname im Charakter-Ordner
  // `_version` bewusst offener int, kein Literal-Union: eine von einer neueren App
  // geschriebene Datei soll in einer älteren trotzdem laden.
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
