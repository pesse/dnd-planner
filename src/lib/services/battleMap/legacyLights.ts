/** Ältere Karten führen ihre Lichter je Ebene als `lighting.lights` in Bildpixeln — sie werden zu Licht-Tokens. */
import { z } from 'zod';
import { gridSchema } from '../../schemas/battleMap';
import { BASE_LEVEL } from './levels';
import { KIND_COLOR } from './tokenSources';

const legacyLightsSchema = z.array(
  z.object({
    id: z.string(),
    x: z.number(),
    y: z.number(),
    radius: z.number().positive().default(4),
    color: z.string().default('#ffb347'),
  }),
);

type Raw = Record<string, unknown>;
const isRaw = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Arbeitet auf dem rohen JSON vor `battleMapSchema.parse`, das die alten Felder sonst stumm verwirft. */
export function liftLegacyLights(raw: unknown): unknown {
  if (!isRaw(raw)) return raw;
  const grid = gridSchema.parse(raw.grid ?? {});
  const lifted: Raw[] = [];
  const take = (layer: unknown, level: unknown) => {
    if (!isRaw(layer) || !isRaw(layer.lighting) || typeof level !== 'string') return;
    const lights = legacyLightsSchema.safeParse(layer.lighting.lights);
    delete layer.lighting.lights;
    if (!lights.success) return;
    for (const l of lights.data) {
      lifted.push({
        id: l.id,
        name: `Licht ${lifted.length + 1}`,
        kind: 'light',
        color: KIND_COLOR.light,
        x: (l.x - grid.offsetX) / grid.size - 0.5,
        y: (l.y - grid.offsetY) / grid.size - 0.5,
        light: { radius: l.radius, color: l.color },
        level,
      });
    }
  };
  take(raw, BASE_LEVEL);
  if (Array.isArray(raw.levels)) for (const l of raw.levels) take(l, isRaw(l) ? l.id : null);
  if (lifted.length) raw.tokens = [...(Array.isArray(raw.tokens) ? raw.tokens : []), ...lifted];
  return raw;
}
