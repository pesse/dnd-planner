/**
 * Antwort des inoffiziellen D&D-Beyond-Character-Service (`/character/v5/character/{id}`) —
 * nur der Teil, den der Import liest. Alles nullish: der Endpunkt ist undokumentiert.
 */
import { z } from 'zod';

const num = z.number().nullish();
const str = z.string().nullish();
const list = <T extends z.ZodTypeAny>(v: T) => z.array(v).nullish().transform((x) => x ?? []);

const ddbModifierSchema = z.object({
  type: z.string(),
  subType: z.string(),
  value: num,
  statId: num,
  componentId: num,
  entityTypeId: num.describe('1782728300 = Waffe — trennt Einzelwaffen-Übung von Werkzeugen.'),
  friendlySubtypeName: str,
});
export type DdbModifier = z.infer<typeof ddbModifierSchema>;

const ddbModifiersSchema = z.object({
  race: list(ddbModifierSchema), class: list(ddbModifierSchema), background: list(ddbModifierSchema),
  item: list(ddbModifierSchema), feat: list(ddbModifierSchema), condition: list(ddbModifierSchema),
});

const ddbStatSchema = z.object({ id: z.number(), value: num });

/** Herkunft und Text jeder Definition (Klasse, Volk, Talent, Gegenstand, Zauber). */
const ddbDefinitionMeta = {
  description: str.describe('HTML.'),
  snippet: str,
  isHomebrew: z.boolean().nullish(),
  sourceId: num,
  sources: list(z.object({ sourceId: num })),
};

const ddbItemDefinitionSchema = z.object({
  ...ddbDefinitionMeta,
  id: num,
  name: z.string(),
  type: str.describe('„Shield", „Dagger", „Wondrous item" …'),
  weight: num,
  bundleSize: num,
  cost: num.describe('In GM.'),
  rarity: str,
  magic: z.boolean().nullish(),
  armorClass: num,
  armorTypeId: num.describe('1 leicht, 2 mittel, 3 schwer, 4 Schild.'),
  stealthCheck: num.describe('2 = Nachteil auf Heimlichkeit.'),
  strengthRequirement: num,
  damage: z.object({ diceString: str }).nullish(),
  damageType: str,
  categoryId: num.describe('Waffen: 1 einfach, 2 Kriegswaffe.'),
  attackType: num.describe('1 Nahkampf, 2 Fernkampf.'),
  properties: list(z.object({ name: z.string() })),
  filterType: str,
  canAttune: z.boolean().nullish(),
  attunementDescription: str,
  grantedModifiers: list(ddbModifierSchema),
});

const ddbInventoryItemSchema = z.object({
  equipped: z.boolean().nullish(),
  isAttuned: z.boolean().nullish(),
  quantity: z.number().nullish(),
  definition: ddbItemDefinitionSchema,
});

const ddbSpellSchema = z.object({
  componentId: num,
  prepared: z.boolean().nullish(),
  alwaysPrepared: z.boolean().nullish(),
  definition: z.object({ ...ddbDefinitionMeta, name: z.string(), level: num }).nullish(),
});

const ddbOptionSchema = z.object({ id: z.number(), label: z.string() });

const ddbChoiceSchema = z.object({
  componentId: num,
  componentTypeId: num,
  type: num,
  optionValue: num,
  options: list(ddbOptionSchema),
});
export type DdbChoice = z.infer<typeof ddbChoiceSchema>;

const ddbFeatureRefSchema = z.object({
  definition: z.object({ id: num, name: z.string(), requiredLevel: num }),
});

const ddbClassSchema = z.object({
  id: num,
  level: z.number(),
  definition: z.object({ ...ddbDefinitionMeta, name: z.string(), hitDice: num, canCastSpells: z.boolean().nullish() }),
  subclassDefinition: z.object({ ...ddbDefinitionMeta, name: z.string() }).nullish(),
  classFeatures: list(ddbFeatureRefSchema),
});

export const ddbCharacterJsonSchema = z.object({
  id: z.number(),
  name: z.string(),
  username: str,
  gender: str, faith: str, hair: str, eyes: str, skin: str, height: str,
  age: num, weight: num, alignmentId: num, currentXp: num,
  inspiration: z.boolean().nullish(),
  baseHitPoints: num, bonusHitPoints: num, overrideHitPoints: num,
  stats: list(ddbStatSchema), bonusStats: list(ddbStatSchema), overrideStats: list(ddbStatSchema),
  race: z.object({
    ...ddbDefinitionMeta,
    fullName: z.string(),
    sizeId: num,
    weightSpeeds: z.object({ normal: z.object({ walk: num }).nullish() }).nullish(),
    racialTraits: list(ddbFeatureRefSchema),
  }).nullish(),
  background: z.object({
    definition: z.object({ ...ddbDefinitionMeta, name: z.string() }).nullish(),
    customBackground: z.object({ name: str }).nullish(),
  }).nullish(),
  classes: list(ddbClassSchema),
  feats: list(z.object({ componentId: num, definition: z.object({ ...ddbDefinitionMeta, id: num, name: z.string() }) })),
  modifiers: ddbModifiersSchema.nullish(),
  choices: z.object({
    race: list(ddbChoiceSchema), class: list(ddbChoiceSchema), background: list(ddbChoiceSchema), feat: list(ddbChoiceSchema),
    choiceDefinitions: list(z.object({ id: z.string(), options: list(ddbOptionSchema) }))
      .describe('Optionslisten, Schlüssel `${componentTypeId}-${type}` der Wahl.'),
  }).nullish(),
  inventory: list(ddbInventoryItemSchema),
  customItems: list(z.object({ name: z.string(), description: str, quantity: num, weight: num, cost: num })),
  currencies: z.object({ cp: num, sp: num, ep: num, gp: num, pp: num }).nullish(),
  traits: z.object({ personalityTraits: str, ideals: str, bonds: str, flaws: str, appearance: str }).nullish(),
  notes: z.object({
    allies: str, organizations: str, enemies: str, backstory: str,
    personalPossessions: str, otherHoldings: str, otherNotes: str,
  }).nullish(),
  spells: z.object({
    race: list(ddbSpellSchema), class: list(ddbSpellSchema), feat: list(ddbSpellSchema),
    item: list(ddbSpellSchema), background: list(ddbSpellSchema),
  }).nullish(),
  classSpells: list(z.object({ characterClassId: num, spells: list(ddbSpellSchema) })),
});
export type DdbCharacterJson = z.infer<typeof ddbCharacterJsonSchema>;

/** Umschlag des Character-Service: `success: false` kommt mit HTTP 200 ebenso vor. */
export const ddbCharacterResponseSchema = z.object({
  success: z.boolean().nullish(),
  message: str,
  data: z.unknown(),
});
