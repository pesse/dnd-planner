/** Eine Kampfkarte: Bild, Raster, Tokens, Nebel und rein optisches Licht. Koordinaten in Bildpixeln. */
import { z } from 'zod';
import { CONDITION_KEYS } from './vocabulary';

export const TOKEN_KINDS = ['character', 'monster', 'marker', 'trap'] as const;

export const TRAP_STATES = { armed: 'Scharf', triggered: 'Ausgelöst', disarmed: 'Entschärft' } as const;
export type TrapState = keyof typeof TRAP_STATES;
const TRAP_STATE_KEYS = Object.keys(TRAP_STATES) as [TrapState, ...TrapState[]];

/** Liegt neben den Zuständen am Token, ist aber keiner: Brand ist eine Gefahr, Konzentration eine Zauberregel. */
export const TOKEN_EFFECTS = { burning: 'Brand', concentration: 'Konzentration' } as const;
export type TokenEffect = keyof typeof TOKEN_EFFECTS;
export const TOKEN_EFFECT_KEYS = Object.keys(TOKEN_EFFECTS) as [TokenEffect, ...TokenEffect[]];

export const gridSchema = z.object({
  size: z.number().positive().default(70).describe('Kantenlänge eines Feldes in Bildpixeln.'),
  offsetX: z.number().default(0),
  offsetY: z.number().default(0),
  visible: z.boolean().default(true),
  opacity: z.number().min(0).max(1).default(0.35),
  metersPerCell: z.number().positive().default(1.5),
});

export const tokenSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(TOKEN_KINDS).default('marker'),
  ref: z.string().default('').describe('Charakter-UID, Monster-Slug bzw. Fallen-Key; leer bei Markierungen.'),
  art: z.string().default('').describe('Bildname für `artUrl`; Charaktere lösen ihr Porträt selbst auf.'),
  x: z.number().describe('Linke obere Ecke in Feldern.'),
  y: z.number(),
  size: z.number().positive().default(1).describe('Kantenlänge in Feldern (Groß = 2).'),
  hidden: z.boolean().default(false).describe('Für Spieler unsichtbar.'),
  color: z.string().default('#8a2012'),
  note: z.string().default('').describe('Nur für die SL.'),
  encounter: z.string().default('').describe('`<akt>/<encounter>` innerhalb der Kampagne; leer ohne Encounter.'),
  hp: z.number().int().nullable().default(null).describe('Aktuelle TP eines Monsters; null = noch nicht gezählt.'),
  hpMax: z.number().int().nullable().default(null),
  conditions: z.array(z.enum(CONDITION_KEYS)).default([]),
  effects: z.array(z.enum(TOKEN_EFFECT_KEYS)).default([]),
  initiative: z.number().int().nullable().default(null).describe('null = nimmt nicht am Kampf teil.'),
  trapState: z.enum(TRAP_STATE_KEYS).default('armed'),
  trapTier: z.number().int().min(0).default(0).describe('Stufe einer Falle: 0 = Grundwerte, n = n-ter Eintrag in `tiers`.'),
});

const point = z.tuple([z.number(), z.number()]);

export const FOG_MODES = ['reveal', 'cover'] as const;

export const fogOpSchema = z.discriminatedUnion('shape', [
  z.object({
    shape: z.literal('rect'),
    mode: z.enum(FOG_MODES),
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
  }),
  z.object({
    shape: z.literal('brush'),
    mode: z.enum(FOG_MODES),
    r: z.number().positive(),
    points: z.array(point),
  }),
]);

export const fogSchema = z.object({
  enabled: z.boolean().default(true),
  ops: z.array(fogOpSchema).default([]).describe('Der Reihe nach auf eine zugedeckte Karte angewandt.'),
});

export const lightSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  radius: z.number().positive().default(4).describe('In Feldern.'),
  color: z.string().default('#ffb347'),
});

export const lightingSchema = z.object({
  darkness: z.number().min(0).max(1).default(0),
  lights: z.array(lightSchema).default([]),
});

export const viewRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
});

export const combatSchema = z.object({
  round: z.number().int().min(0).default(0).describe('0 = kein Kampf.'),
  turn: z.string().default('').describe('Token-ID, die gerade am Zug ist.'),
});

export const battleMapSchema = z.object({
  name: z.string(),
  image: z.string().default('').describe('Dateiname des Kartenbilds neben der Kartendatei.'),
  acts: z.array(z.string()).default([]).describe('Akt-Ordner, deren Encounter die Karte anbietet; leer = alle Akte der Kampagne.'),
  grid: gridSchema.default(gridSchema.parse({})),
  tokens: z.array(tokenSchema).default([]),
  fog: fogSchema.default(fogSchema.parse({})),
  lighting: lightingSchema.default(lightingSchema.parse({})),
  playerView: viewRectSchema.nullable().default(null).describe('Ausschnitt der Spieleransicht; null = ganze Karte.'),
  combat: combatSchema.default(combatSchema.parse({})),
});

export type BattleMap = z.infer<typeof battleMapSchema>;
export type Grid = z.infer<typeof gridSchema>;
export type Token = z.infer<typeof tokenSchema>;
export type TokenKind = (typeof TOKEN_KINDS)[number];
export type FogOp = z.infer<typeof fogOpSchema>;
export type FogMode = (typeof FOG_MODES)[number];
export type Light = z.infer<typeof lightSchema>;
export type Lighting = z.infer<typeof lightingSchema>;
export type ViewRect = z.infer<typeof viewRectSchema>;
export type Combat = z.infer<typeof combatSchema>;
