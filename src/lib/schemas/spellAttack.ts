/** Wie ein Zauber trifft und was er anrichtet — so, dass er als Zeile in der Angriffstabelle steht. */
import { z } from 'zod';
import { ABILITY_KEYS } from './abilities';
import { DAMAGE_TYPES } from './vocabulary';

const diceSchema = z.string().regex(/^\d+d\d+$/).describe('Würfel wie "2d6".');

const spellDamageSchema = z.object({
  dice: diceSchema,
  bonus: z.number().int().optional().describe('Fester Zuschlag je Treffer (Magisches Geschoss: 1d4 + 1).'),
  addMod: z.boolean().optional().describe('Plus Zauberattributsmodifikator (Spirituelle Waffe: 1d8 + Mod).'),
  type: z.enum(DAMAGE_TYPES).optional().describe('Fehlt = Schadensart nach Wahl beim Wirken (Chromatische Kugel).'),
});

const common = {
  damage: z.array(spellDamageSchema).min(1).describe('Schaden EINES Treffers auf dem Grad des Zaubers; mehrere Einträge bei gemischten Schadensarten (Eissturm).'),
  count: z.number().int().min(1).optional().describe('Strahlen, Geschosse oder Angriffe pro Wirkung (Sengender Strahl: 3); fehlt = 1.'),
  cantrip: z
    .enum(['dice', 'count'])
    .optional()
    .describe('Nur Zaubertricks: was auf Charakterstufe 5/11/17 wächst — die Würfelzahl (Feuerpfeil) oder die Anzahl (Schauriger Strahl). Fehlt = "dice".'),
  upcast: z
    .object({
      dice: diceSchema.optional().describe('Zusätzliche Würfel je Grad über dem Zaubergrad, für jeden Schadenseintrag mit derselben Würfelgröße (Flammenschlag: Feuer UND Gleißend), sonst für den ersten.'),
      count: z.number().int().min(1).optional().describe('Zusätzliche Strahlen/Geschosse je Grad über dem Zaubergrad.'),
    })
    .optional(),
};

export const spellAttackSchema = z.discriminatedUnion('roll', [
  z.object({ roll: z.literal('attack'), range: z.enum(['melee', 'ranged']), ...common })
    .describe('Zauberangriffswurf (Feuerpfeil).'),
  z.object({
    roll: z.literal('save'),
    save: z.enum(ABILITY_KEYS),
    onSave: z.enum(['half', 'none']).describe('Schaden bei gelungenem Rettungswurf.'),
    ...common,
  }).describe('Rettungswurf gegen den Zauber-SG (Feuerball).'),
  z.object({ roll: z.literal('auto'), ...common }).describe('Trifft ohne Wurf (Magisches Geschoss).'),
]);
export type SpellAttack = z.infer<typeof spellAttackSchema>;
export type SpellAttackDamage = z.infer<typeof spellDamageSchema>;
