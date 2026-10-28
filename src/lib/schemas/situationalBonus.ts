/** Ein Bonus, der nur in einer Lage gilt, die die App nicht kennt — er zählt nie, er steht als Hinweis. */
import { z } from 'zod';

export const situationalBonusSchema = z.object({
  value: z.number().int(),
  condition: z.string().describe('Die Lage aus dem Regeltext, englisch ("against ranged attack rolls").'),
  conditionDe: z.string().optional().describe('Dieselbe Lage deutsch ("gegen Fernkampfangriffe"); so zeigt sie der Bogen.'),
});
export type SituationalBonus = z.infer<typeof situationalBonusSchema>;

export const situationalLabelDe = (b: Pick<SituationalBonus, 'condition' | 'conditionDe'>): string => b.conditionDe?.trim() || b.condition;
