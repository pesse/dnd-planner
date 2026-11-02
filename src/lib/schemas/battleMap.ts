/** Eine Kampfkarte: Bild, Raster, Tokens, Nebel und rein optisches Licht. Koordinaten in Bildpixeln. */
import { z } from 'zod';

export const TOKEN_KINDS = ['character', 'monster', 'marker'] as const;

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
  ref: z.string().default('').describe('Charakter-UID bzw. Monster-Slug; leer bei Markierungen.'),
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

export const battleMapSchema = z.object({
  name: z.string(),
  image: z.string().default('').describe('Dateiname des Kartenbilds neben der Kartendatei.'),
  grid: gridSchema.default(gridSchema.parse({})),
  tokens: z.array(tokenSchema).default([]),
  fog: fogSchema.default(fogSchema.parse({})),
  lighting: lightingSchema.default(lightingSchema.parse({})),
  playerView: viewRectSchema.nullable().default(null).describe('Ausschnitt der Spieleransicht; null = ganze Karte.'),
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
