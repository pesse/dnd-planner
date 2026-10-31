/** Was ein D&D-Beyond-Charakter hergibt, englisch und unübersetzt — die Zwischenform des Imports. */
import { z } from 'zod';
import { SKILL_NAMES } from './vocabulary';

const abilityRecord = <T extends z.ZodTypeAny>(v: T) =>
  z.object({ str: v, dex: v, con: v, int: v, wis: v, cha: v });

/** Woher eine Definition stammt — daraus entstehen die Hinweise des Wizards. */
const ddbOriginSchema = z.object({
  sourceId: z.number().int().nullable().describe('Buch-ID im Quellenkatalog von D&D Beyond (`api/config/json`).'),
  homebrew: z.boolean(),
  desc: z.string().describe('Klartext, aus dem HTML von D&D Beyond.'),
});
export type DdbOrigin = z.infer<typeof ddbOriginSchema>;

const ddbSkillSchema = z.object({
  name: z.enum(SKILL_NAMES),
  value: z.number().int(),
  mark: z.enum(['', 'P', 'E', 'H']).describe('P geübt, E Expertise, H halber Übungsbonus (Jack of All Trades).'),
});

const ddbFeatureSchema = z.object({
  section: z.string().describe('„GNOME SPECIES TRAITS", „WIZARD FEATURES", „FEATS".'),
  name: z.string(),
  options: z.array(z.string()).describe('Getroffene Wahlen.'),
  origin: ddbOriginSchema.nullable().describe('Nur bei Talenten.'),
});
export type DdbFeature = z.infer<typeof ddbFeatureSchema>;

/** Genug, um einen fehlenden Gegenstand als Vault-Eintrag anzulegen. */
const ddbItemDetailSchema = z.object({
  type: z.string(),
  filterType: z.string(),
  rarity: z.string(),
  magic: z.boolean(),
  costGp: z.number().nullable(),
  weightLb: z.number().nullable().describe('Pro Stück.'),
  armorClass: z.number().nullable(),
  armorTypeId: z.number().nullable(),
  stealthDisadvantage: z.boolean(),
  strengthRequirement: z.number().nullable(),
  damage: z.string(),
  damageType: z.string(),
  weaponCategoryId: z.number().nullable(),
  ranged: z.boolean(),
  properties: z.array(z.string()),
  attunement: z.string().describe('Leer = keine Einstimmung.'),
});
export type DdbItemDetail = z.infer<typeof ddbItemDetailSchema>;

const ddbItemSchema = z.object({
  name: z.string(),
  qty: z.number(),
  totalWeightLb: z.number().nullable().describe('Gewicht der ganzen Zeile, nicht pro Stück.'),
  equipped: z.boolean(),
  origin: ddbOriginSchema,
  detail: ddbItemDetailSchema.nullable().describe('null = selbst angelegter Gegenstand (customItems).'),
});
export type DdbItem = z.infer<typeof ddbItemSchema>;

const ddbSpellSchema = z.object({
  name: z.string(),
  level: z.number().int(),
  source: z.string().describe('Klasse, Talent oder Merkmal, z. B. „Magic Initiate (Wizard)".'),
  origin: ddbOriginSchema,
});
export type DdbSpell = z.infer<typeof ddbSpellSchema>;

const ddbNamedSchema = z.object({ name: z.string(), origin: ddbOriginSchema.nullable() });
export type DdbNamed = z.infer<typeof ddbNamedSchema>;

const ddbClassSchema = z.object({
  name: z.string(),
  level: z.number().int(),
  origin: ddbOriginSchema.nullable(),
  subclass: ddbNamedSchema.nullable(),
});

export const ddbSheetSchema = z.object({
  id: z.string(),
  name: z.string(),
  playerName: z.string(),
  classes: z.array(ddbClassSchema),
  species: ddbNamedSchema,
  background: ddbNamedSchema,
  xp: z.string(),
  abilities: abilityRecord(z.number().int()),
  saveProfs: abilityRecord(z.boolean()),
  skills: z.array(ddbSkillSchema),
  ac: z.string(),
  initiative: z.string(),
  speedFt: z.number(),
  hpMax: z.string(),
  hitDice: z.string(),
  proficiencyBonus: z.number().int(),
  heroicInspiration: z.boolean(),
  passivePerception: z.string(),
  armor: z.array(z.string()),
  weapons: z.array(z.string()),
  tools: z.array(z.string()),
  languages: z.array(z.string()),
  features: z.array(ddbFeatureSchema),
  inventory: z.array(ddbItemSchema),
  currency: z.object({ cp: z.string(), sp: z.string(), ep: z.string(), gp: z.string(), pp: z.string() }),
  personal: z.object({
    gender: z.string(), age: z.string(), size: z.string(), height: z.string(), weight: z.string(),
    alignment: z.string(), faith: z.string(), skin: z.string(), eyes: z.string(), hair: z.string(),
  }),
  traits: z.string(),
  ideals: z.string(),
  bonds: z.string(),
  flaws: z.string(),
  allies: z.string(),
  backstory: z.string(),
  notes: z.string(),
  spells: z.array(ddbSpellSchema),
  spellcastingClasses: z.array(z.string()),
});
export type DdbSheet = z.infer<typeof ddbSheetSchema>;
