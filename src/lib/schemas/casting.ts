/**
 * Was ein Merkmal an Zauberwirken gewährt — Kontingent, Pool, Tauschtakt und Wirk-Ressource.
 * Eine Form für Klassen-Zauberwirken, Spezies-Zauber, Talent-Zugänge und immer-vorbereitete
 * Listen; der Plan dazu steht in `docs/plan/plan-zauberquellen.md`.
 */
import { z } from 'zod';
import { ABILITY_NAMES } from './abilities';
import { amountSchema } from './amount';
import { resourceRefSchema } from './resource';
import { SPELL_SCHOOL_KEYS } from './vocabulary';
import { whenSchema } from './when';

const schoolEnum = z.enum(SPELL_SCHOOL_KEYS);

/**
 * Die Anzahl steckt im Wert, auch beim Zaubertrick: jede Tauschregel im Regelwerk nennt sie
 * („you can replace **one** of your cantrips").
 */
export const SWAP_CADENCES = ['none', 'level-up-one', 'short-rest-one', 'long-rest-one', 'long-rest-all'] as const;
export type SwapCadence = (typeof SWAP_CADENCES)[number];

// Eine Liste, wenn ein Merkmal einen Takt ERGÄNZT: Zauber auswendig lernen (Kurze Rast) tritt
// neben die freie Neuwahl nach der Langen Rast, statt sie zu ersetzen.
const swapCadenceSchema = z.union([z.enum(SWAP_CADENCES), z.array(z.enum(SWAP_CADENCES)).min(1)]);

export const swapRuleSchema = z.object({
  spells: swapCadenceSchema.optional().describe('Tauschtakt für Zauber ab Grad 1.'),
  cantrips: swapCadenceSchema.optional().describe('Tauschtakt für Zaubertricks.'),
});
export type SwapRule = z.infer<typeof swapRuleSchema>;

export const swapCadences = (value: SwapRule['spells']): SwapCadence[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

/**
 * Womit gewirkt wird. Mehrere je Quota sind der Normalfall — ein Spezies-Zauber geht gratis
 * ODER über einen Zauberplatz.
 */
export const castOptionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('slots'),
    // Ein Name, kein Vokabular: den Pool benennt, wer ihn deklariert (`grantsResource`).
    pool: z.string().default('standard'),
  }),
  z.object({
    kind: z.literal('uses'),
    per: z.enum(['long-rest', 'short-rest']),
    count: amountSchema.describe('Freie Wirkungen ohne Platz.'),
  }),
  z.object({ kind: z.literal('at-will') }),
  // Der Vorrat gehört einem ANDEREN Merkmal (Tiergestalt, Fokuspunkte) und wird dort gezählt.
  // `resource` fehlt nur bei noch nicht nachgezogenen Einträgen — die Auflösung MELDET das,
  // statt `labelDe` stillschweigend als Prosa durchzureichen.
  z.object({
    kind: z.literal('resource'),
    resource: resourceRefSchema.optional(),
    amount: z.number().int().min(1).default(1).describe('Kosten je Wirkung, aus dem Ziel-Vorrat.'),
    labelDe: z.string().default('').describe('Leer = Label des Ziel-Vorrats.'),
  }),
  z.object({
    kind: z.literal('ritual'),
    requiresPrepared: z
      .boolean()
      .describe('false = auch unvorbereitet wirkbar (Ritual Adept liest aus dem Buch).'),
  }),
]);
export type CastOption = z.infer<typeof castOptionSchema>;

/** Zustände, in denen das Zaubern eigens geregelt ist. */
export const CASTING_STATES = ['wild-shape', 'rage'] as const;
export type CastingState = (typeof CASTING_STATES)[number];

/** „You can't cast spells" — der Zustand sperrt das Zaubern, `castableIn` macht Ausnahmen. */
export const castingBlockSchema = z.object({
  state: z.enum(CASTING_STATES),
  concentration: z.enum(['kept', 'ends']).describe('Was mit laufender Konzentration geschieht.'),
});
export type CastingBlock = z.infer<typeof castingBlockSchema>;

export const castableInSchema = z.object({
  state: z.enum(CASTING_STATES),
  exceptCostlyMaterial: z
    .boolean()
    .default(false)
    .describe('Nicht für Zauber, deren Materialkomponente einen Preis nennt oder verbraucht wird.'),
});
export type CastableIn = z.infer<typeof castableInSchema>;

export const SPELL_COMPONENTS = ['verbal', 'somatic', 'material'] as const;
export type SpellComponent = (typeof SPELL_COMPONENTS)[number];

export const componentWaiverSchema = z.object({
  omit: z.array(z.enum(SPELL_COMPONENTS)).min(1),
  keepCostlyMaterial: z
    .boolean()
    .default(false)
    .describe('Material mit Preis oder Verbrauch bleibt nötig („unless they are consumed or have a cost").'),
  schools: z.array(schoolEnum).default([]).describe('Nur Zauber dieser Schulen; leer = alle.'),
  whenDe: z.string().default('').describe('Bedingung, wie sie auf dem Bogen steht („über Zaubereipunkte"); leer = immer.'),
});
export type ComponentWaiver = z.infer<typeof componentWaiverSchema>;

/** Zeigt auf eine Quota — `pool.from` zieht daraus, `into` legt hinein. */
export const quotaRefSchema = z.object({
  feature: z.string().default('').describe('Merkmals-Key; leer = dasselbe Merkmal.'),
  quota: z.string(),
});
export type QuotaRef = z.infer<typeof quotaRefSchema>;

/**
 * Woraus gewählt wird. `from` ist der Angelpunkt des Zauberbuchs: die Vorbereitung zieht aus
 * einer anderen Quota statt aus einer Liste, damit „bekannt vs. vorbereitet" kein Sonderfall ist.
 */
export const spellPoolSchema = z.object({
  lists: z.array(z.string()).default([]).describe('Englische Klassen-Keys ("cleric", "wizard").'),
  listMode: z
    .enum(['union', 'choose-one'])
    .default('union')
    .describe('choose-one = der Spieler legt EINE Liste je Quelle fest (Eingeweihter der Magie).'),
  schools: z.array(schoolEnum).default([]).describe('Schul-Filter; leer = alle.'),
  ritual: z.boolean().default(false).describe('Nur Zauber mit Ritual-Tag (Pakt des Buches).'),
  from: quotaRefSchema.optional().describe('Der Pool IST eine andere Quota — das Zauberbuch.'),
  names: z
    .array(z.string())
    .default([])
    .describe('Feste englische Namen ohne Wahl; zusammen mit lists = Vorgabe plus Tauschpool.'),
  // Die Namen bleiben im `desc` und werden GELESEN — eine zweite Fassung im Vault liefe beim
  // Re-Import auseinander (services/grantedSpells.ts). Mehrere Tabellen werden vereinigt.
  fromDescTable: z
    .boolean()
    .default(false)
    .describe('Namen aus der Markdown-Tabelle im desc des Merkmals, je Zeile ab der genannten Stufe.'),
  descTable: z
    .string()
    .optional()
    .describe('Mit fromDescTable: nur die Tabelle unter „Table: <Titel>" ("Arid Land"); fehlt = alle vereinigt.'),
});
export type SpellPool = z.infer<typeof spellPoolSchema>;

/**
 * `'slotted'` und `'cantrip-or-slotted'` sind Zitate aus dem Regeltext („of a level for which you
 * have spell slots"), aufgelöst gegen den Platz-Pool DIESER Quota — deshalb trägt Mystic Arcanum
 * `[6]` ausdrücklich, es hat nie Plätze dieses Grades.
 */
export const quotaLevelsSchema = z.union([
  z.array(z.number().int().min(0).max(9)),
  z.literal('slotted'),
  z.literal('cantrip-or-slotted'),
]);

/**
 * Ohne Vorgaben: `quotaPatchSchema.set` leitet die Teilform hiervon ab, und eine Vorgabe darin
 * patchte ein Feld, das niemand gesetzt hat — Ritual Adept schaltete so `tier` auf `prepared`.
 */
const quotaBaseSchema = z.object({
  id: z.string().describe('Nur innerhalb des Merkmals eindeutig.'),
  since: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe('Vorgabe: min(gainedAt). Nur nötig, wenn EIN Merkmal über mehrere Stufen Verschiedenes gibt.'),
  when: whenSchema.optional(),
  tier: z.enum(['known', 'prepared']).describe('known = Bestand, nicht wirkbar (Zauberbuch).'),
  levels: quotaLevelsSchema.optional().describe('Entfällt bei pool.names — der Grad steht am Zauber.'),
  // Entfällt bei festem Pool (`names`/`fromDescTable`): dort ist alles gewährt, eine Zahl
  // daneben wäre eine zweite, abweichbare Fassung der Listenlänge.
  count: amountSchema.optional(),
  pool: spellPoolSchema,
  // Erwerb und Behälter sind zweierlei: „add them to your spellbook for free" gewährt die Wahl
  // HIER (eigenes count, eigene Schranken) und legt sie DORT ab, wo die Vorbereitung sie findet.
  into: quotaRefSchema
    .optional()
    .describe('Die gewählten Zauber gehören zusätzlich in dieses Kontingent (Zauberbuch).'),
  swap: swapRuleSchema.optional().describe('Überschreibt die Vorgabe der Quelle.'),
  castableIn: castableInSchema.optional().describe('Auch in diesem Zustand wirkbar, obwohl er das Zaubern sperrt.'),
  waiveComponents: z.array(componentWaiverSchema).optional(),
  // PFLICHT und ohne Vererbung: eine Quellen-Vorgabe wäre für Zaubertrick-Quotas immer falsch.
  // Leer ist zulässig und heißt „für sich nicht wirkbar" — das Zauberbuch vor Ritual Adept.
  cast: z.array(castOptionSchema),
});

export const quotaSchema = quotaBaseSchema.extend({
  tier: quotaBaseSchema.shape.tier.default('prepared'),
});
export type Quota = z.infer<typeof quotaSchema>;

/** Ritual Adept ergänzt das Wirken am Zauberbuch, Magische Geheimnisse den Pool der Vorbereitung. */
export const quotaPatchSchema = z.object({
  feature: z.string().describe('Merkmals-Key, dessen Quota amendiert wird.'),
  quota: z.string(),
  set: quotaBaseSchema.partial().describe('Nur die geänderten Felder; Arrays und `pool` ersetzen.'),
});
export type QuotaPatch = z.infer<typeof quotaPatchSchema>;

export const abilityBindingSchema = z.object({
  fixed: z.enum(ABILITY_NAMES).optional().describe('Von der Klasse festgelegt.'),
  choose: z.array(z.enum(ABILITY_NAMES)).default([]).describe('Bei Erwerb gewählt (Spezies, Talent).'),
  sameAs: z
    .string()
    .default('')
    .describe('Merkmals-Key, dessen Attributwahl gilt — „uses the same spellcasting ability you use for …".'),
  fromIncrease: z
    .boolean()
    .default(false)
    .describe('Mit choose: es gilt das Attribut, das die Attributserhöhung desselben Merkmals wählt („the ability increased by this feat"); keine eigene Frage.'),
  own: z
    .boolean()
    .default(false)
    .describe('„uses your spell save DC and spell attack modifier" (Gegenstände): das Attribut der Zauberquelle des Charakters mit dem höchsten SG.'),
  fixedDc: z.number().int().optional().describe('Fester Rettungswurf-SG des Gegenstands („save DC 15"); gilt statt der Rechnung.'),
  fixedAttack: z.number().int().optional().describe('Fester Zauberangriffsbonus des Gegenstands („+7 to hit"); gilt statt der Rechnung.'),
});
export type AbilityBinding = z.infer<typeof abilityBindingSchema>;

/**
 * `origin`, `labelDe` und `levelRef` stehen hier bewusst NICHT: der Merkmals-Key ist die
 * Identität, `nameDe` das Label, und ob die Klassen- oder die Charakterstufe zählt, entscheidet
 * die Herkunft — ein Trait weiß nicht, dass es ein Trait ist.
 */
export const castingGrantSchema = z.object({
  ability: abilityBindingSchema.optional(),
  quotas: z.array(quotaSchema).default([]),
  patches: z.array(quotaPatchSchema).default([]),
  swap: swapRuleSchema.optional().describe('Vorgabe für alle Quotas dieses Merkmals.'),
  blocks: z.array(castingBlockSchema).default([]),
});
export type CastingGrant = z.infer<typeof castingGrantSchema>;
